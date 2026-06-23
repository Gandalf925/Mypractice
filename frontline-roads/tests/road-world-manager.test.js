import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { RoadWorldManager, roadWorldId } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { chunkCenterLocation, chunksNearWorldPoint, createRoadChunkState, parseChunkId } from '../src/roads/world-chunk-grid.js';

function baseGraph() {
  return attachGraphIndexes({
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 }
    ],
    edges: [{ id: 'ab', a: 'a', b: 'b', length: 100, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false }],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1
  });
}

function chunkGraph(id) {
  return attachGraphIndexes({
    nodes: [
      { id: 'node_0', x: 99, y: 1, chunkIds: [id] },
      { id: 'node_1', x: 700, y: 0, chunkIds: [id] }
    ],
    edges: [{ id: 'next', a: 'node_0', b: 'node_1', length: 601, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false, chunkIds: [id] }],
    center: { lat: 35, lon: 139 }, source: 'test-chunk', roadSpecVersion: 2, chunkId: id
  });
}

function storeWithWorld() {
  const state = createInitialState();
  state.world.roadGraph = baseGraph();
  state.world.roadChunks = createRoadChunkState();
  state.player.worldPosition = { x: 590, y: 100 };
  return new StateStore(state, new EventBus());
}

test('chunk prefetch only includes crossed or nearby grid edges', () => {
  assert.deepEqual(chunksNearWorldPoint({ x: 300, y: 300 }).map(item => item.id), ['0:0']);
  assert.deepEqual(chunksNearWorldPoint({ x: 590, y: 300 }).map(item => item.id).sort(), ['0:0', '1:0']);
  assert.deepEqual(chunksNearWorldPoint({ x: 590, y: 590 }).map(item => item.id).sort(), ['0:0', '0:1', '1:0', '1:1']);
});

test('manager merges a new chunk, records it and persists a compact cache entry', async () => {
  const store = storeWithWorld();
  const cache = new MemoryRoadChunkCache();
  const statuses = [];
  const manager = new RoadWorldManager({
    store,
    cache,
    roadService: { async loadChunk({ chunkId }) { return chunkGraph(chunkId); } },
    onStatus: status => statuses.push(status)
  });
  const chunk = parseChunkId('1:0');
  await manager.loadChunk(chunk, store.select(state => state.world.roadGraph.center));
  const state = store.getState();
  assert.ok(state.world.roadChunks.loaded.includes('1:0'));
  assert.ok(state.world.roadChunks.cached.includes('1:0'));
  assert.ok(state.world.roadChunks.integrated.includes('1:0'));
  assert.equal(state.world.roadGraph.edges.length, 2);
  const cached = await cache.get(roadWorldId(state.world.roadGraph), '1:0');
  assert.ok(cached);
  assert.equal(cached.nodes[0].lat, undefined);
  assert.equal(cached.edges[0].points, undefined);
  assert.equal(statuses.at(-1).type, 'loaded');
});

test('manager loads a cached chunk without calling the road server', async () => {
  const store = storeWithWorld();
  const cache = new MemoryRoadChunkCache();
  const id = '1:0';
  await cache.put(roadWorldId(store.select(state => state.world.roadGraph)), id, chunkGraph(id));
  let calls = 0;
  const manager = new RoadWorldManager({
    store,
    cache,
    roadService: { async loadChunk() { calls += 1; throw new Error('unexpected'); } }
  });
  await manager.loadChunk(parseChunkId(id), store.select(state => state.world.roadGraph.center));
  assert.equal(calls, 0);
  assert.ok(store.select(state => state.world.roadChunks.loaded.includes(id)));
  assert.ok(store.select(state => state.world.roadChunks.integrated.includes(id)));
});

test('failed acquisitions cool down without blocking unrelated nearby chunks', () => {
  let now = 1000;
  const store = storeWithWorld();
  store.mutate(state => {
    state.world.roadChunks.failed['1:0'] = { at: now, message: 'offline' };
  });
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: { async loadChunk() { throw new Error('unused'); } },
    now: () => now
  });
  manager.enqueue = () => {};
  const initialIds = manager.considerLocation({ lat: 35, lon: 139 });
  assert.ok(!initialIds.includes('1:0'));
  assert.ok(initialIds.includes('1:-1'));
  now += 5 * 60 * 1000;
  const retryIds = manager.considerLocation({ lat: 35, lon: 139 });
  assert.ok(retryIds.includes('1:0'));
  manager.abort();
});

test('chunk centers remain based on the original world center', () => {
  const center = { lat: 35, lon: 139 };
  const location = chunkCenterLocation(parseChunkId('2:-1'), center);
  assert.ok(location.lon > center.lon);
  assert.ok(location.lat > center.lat);
});
