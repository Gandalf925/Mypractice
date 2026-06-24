import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { RoadWorldManager, roadWorldId } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { chunkCenterLocation, chunksNearWorldPoint, createRoadChunkState, ensureRoadChunkState, parseChunkId } from '../src/roads/world-chunk-grid.js';

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
  await manager.loadChunk(chunk, store.read(state => state.world.roadGraph.center));
  const state = store.snapshot();
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
  await cache.put(roadWorldId(store.read(state => state.world.roadGraph)), id, chunkGraph(id));
  let calls = 0;
  const manager = new RoadWorldManager({
    store,
    cache,
    roadService: { async loadChunk() { calls += 1; throw new Error('unexpected'); } }
  });
  await manager.loadChunk(parseChunkId(id), store.read(state => state.world.roadGraph.center));
  assert.equal(calls, 0);
  assert.ok(store.read(state => state.world.roadChunks.loaded.includes(id)));
  assert.ok(store.read(state => state.world.roadChunks.integrated.includes(id)));
});

test('failed acquisitions cool down without blocking unrelated nearby chunks', () => {
  let now = 1000;
  const store = storeWithWorld();
  store.transaction(state => {
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


test('legacy initial coverage is released while explicitly merged chunks remain confirmed', () => {
  const state = createInitialState();
  state.world.roadGraph = baseGraph();
  state.world.roadGraph.nodes[1].chunkIds = ['1:0'];
  state.world.roadGraph.edges[0].chunkIds = ['1:0'];
  state.world.roadChunks = {
    version: 1,
    sizeMeters: 600,
    loaded: ['-1:0', '0:0', '1:0'],
    empty: [],
    cached: [],
    integrated: ['-1:0', '0:0', '1:0'],
    playerObserved: ['-1:0', '0:0', '1:0'],
    surveyed: [],
    failed: {},
    updatedAt: 1
  };

  const migrated = ensureRoadChunkState(state.world);

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.loaded, ['1:0']);
  assert.deepEqual(migrated.integrated, ['1:0']);
  assert.deepEqual(migrated.playerObserved, ['1:0']);
});

test('approaching a visible road endpoint queues forward chunks before the grid boundary', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    nodes: [{ id: 'a', x: 0, y: 300 }, { id: 'b', x: 300, y: 300 }],
    edges: [{ id: 'ab', a: 'a', b: 'b', length: 300, roadWidth: 5 }],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1
  });
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.player.worldPosition = { x: 260, y: 300 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {} });
  const queued = [];
  manager.enqueue = (chunk, center, options) => queued.push({ chunk, center, options });

  const ids = manager.considerLocation({ lat: 35, lon: 139 });

  assert.ok(ids.includes('1:0'));
  assert.ok(queued.some(item => item.chunk.id === '1:0' && ['road-frontier', 'movement-lookahead'].includes(item.options.reason)));
});

test('movement lookahead queues the travel direction even before the player reaches a chunk edge', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    nodes: [{ id: 'a', x: 0, y: 300 }, { id: 'b', x: 500, y: 300 }],
    edges: [{ id: 'ab', a: 'a', b: 'b', length: 500, roadWidth: 5 }],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1
  });
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.player.worldPosition = { x: 200, y: 300 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {} });
  manager.enqueue = () => {};
  manager.considerLocation({ lat: 35, lon: 139 });
  store.transaction(draft => { draft.player.worldPosition = { x: 220, y: 300 }; });

  const ids = manager.considerLocation({ lat: 35, lon: 139 });

  assert.ok(ids.includes('1:0'));
});

test('frontier failures retry after the shorter movement cooldown', () => {
  let now = 1000;
  const state = createInitialState();
  state.world.roadGraph = baseGraph();
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.world.roadChunks.failed['1:0'] = { at: now, message: 'temporary' };
  state.player.worldPosition = { x: 590, y: 100 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {}, now: () => now });
  manager.enqueue = () => {};

  assert.ok(!manager.considerLocation({ lat: 35, lon: 139 }).includes('1:0'));
  now += 45 * 1000;
  assert.ok(manager.considerLocation({ lat: 35, lon: 139 }).includes('1:0'));
});


test('an internal cul-de-sac does not masquerade as the outer road frontier', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    nodes: [
      { id: 'west', x: 0, y: 900 },
      { id: 'center', x: 900, y: 900 },
      { id: 'east', x: 1800, y: 900 },
      { id: 'south', x: 900, y: 0 },
      { id: 'north', x: 900, y: 1800 },
      { id: 'spur', x: 1000, y: 1000 }
    ],
    edges: [
      { id: 'west-center', a: 'west', b: 'center', length: 900, roadWidth: 5 },
      { id: 'center-east', a: 'center', b: 'east', length: 900, roadWidth: 5 },
      { id: 'south-center', a: 'south', b: 'center', length: 900, roadWidth: 5 },
      { id: 'center-north', a: 'center', b: 'north', length: 900, roadWidth: 5 },
      { id: 'center-spur', a: 'center', b: 'spur', length: 141, roadWidth: 5 }
    ],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1
  });
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['1:1'], initialObservedChunkIds: ['1:1'] });
  state.player.worldPosition = { x: 990, y: 990 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {} });
  manager.enqueue = () => {};

  assert.deepEqual(manager.considerLocation({ lat: 35, lon: 139 }), []);
});

test('lookahead road chunks remain hidden until the player physically enters them', async () => {
  const state = createInitialState();
  state.world.roadGraph = baseGraph();
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.player.worldPosition = { x: 200, y: 100 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: { async loadChunk({ chunkId }) { return chunkGraph(chunkId); } }
  });

  await manager.loadChunk(parseChunkId('1:0'), state.world.roadGraph.center, { mode: 'movement', observe: false });
  assert.ok(store.read(next => next.world.roadChunks.loaded.includes('1:0')));
  assert.ok(!store.read(next => next.world.roadChunks.playerObserved.includes('1:0')));

  store.transaction(draft => { draft.player.worldPosition = { x: 700, y: 100 }; });
  manager.enqueue = () => {};
  manager.considerLocation({ lat: 35, lon: 139 });
  assert.ok(store.read(next => next.world.roadChunks.playerObserved.includes('1:0')));
});


test('road-frontier movement completes acquisition and merges the new road into the live map', async () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    nodes: [{ id: 'a', x: 0, y: 300 }, { id: 'b', x: 300, y: 300 }],
    edges: [{ id: 'ab', a: 'a', b: 'b', length: 300, roadWidth: 5 }],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1
  });
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.player.worldPosition = { x: 260, y: 300 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: { async loadChunk({ chunkId }) { return chunkGraph(chunkId); } }
  });

  const ids = manager.considerLocation({ lat: 35, lon: 139 });
  assert.ok(ids.includes('1:0'));
  while (manager.running || manager.queue.length > 0) await new Promise(resolve => setTimeout(resolve, 0));

  const next = store.snapshot();
  assert.ok(next.world.roadChunks.loaded.includes('1:0'));
  assert.ok(next.world.roadGraph.edges.length > 1);
});

test('aborting road acquisition prevents a late response from repopulating reset state', async () => {
  const store = storeWithWorld();
  let resolveRequest;
  const requestStarted = new Promise(resolve => { resolveRequest = resolve; });
  let releaseResponse;
  const delayedResponse = new Promise(resolve => { releaseResponse = resolve; });
  const statuses = [];
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: {
      async loadChunk() {
        resolveRequest();
        return delayedResponse;
      }
    },
    onStatus: status => statuses.push(status)
  });

  manager.enqueue(parseChunkId('1:0'), store.read(state => state.world.roadGraph.center));
  await requestStarted;
  manager.abort();
  releaseResponse(chunkGraph('1:0'));
  while (manager.running) await new Promise(resolve => setTimeout(resolve, 0));

  const state = store.snapshot();
  assert.ok(!state.world.roadChunks.loaded.includes('1:0'));
  assert.equal(state.world.roadGraph.edges.length, 1);
  assert.ok(!statuses.some(status => status.type === 'loaded'));
});
