import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes, reachableRoadNodeIds } from '../src/roads/road-graph.js';
import { mergeRoadGraphs } from '../src/roads/graph-merge.js';
import { createRoadChunkState } from '../src/roads/world-chunk-grid.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { buildSitePlanner } from '../src/combat/build-site-planner.js';
import { FrontierSystem } from '../src/exploration/frontier-system.js';

function edge(id, a, b, length = 100) {
  return { id, a, b, length, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false };
}

function baseGraph() {
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'integrity-test', roadSpecVersion: 3,
    nodes: [{ id: 'a', x: 0, y: 300 }, { id: 'b', x: 300, y: 300 }],
    edges: [edge('ab', 'a', 'b', 300)]
  });
}

function extensionGraph(chunkId = '1:0') {
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'integrity-extension', roadSpecVersion: 3,
    chunkId, cacheVersion: 3,
    nodes: [
      { id: `b-${chunkId}`, x: 300, y: 300, chunkIds: [chunkId] },
      { id: `c-${chunkId}`, x: 760, y: 300, chunkIds: [chunkId] }
    ],
    edges: [edge(`bc-${chunkId}`, `b-${chunkId}`, `c-${chunkId}`, 460)]
  });
}

function storeForRoadExpansion() {
  const state = createInitialState();
  state.world.roadGraph = baseGraph();
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.world.city = { nodeId: 'a', hp: 100, maxHp: 100 };
  state.world.homeBase = { id: 'home', status: 'ESTABLISHED', nodeId: 'a', x: 0, y: 300 };
  state.world.playerBases = [{ id: 'home', status: 'ESTABLISHED', nodeId: 'a', x: 0, y: 300, hp: 100, maxHp: 100, primary: true }];
  state.player.worldPosition = { x: 260, y: 300 };
  return new StateStore(state, new EventBus());
}

test('road reachability is computed once until the road topology changes', () => {
  const graph = baseGraph();
  const first = reachableRoadNodeIds(graph, ['a']);
  for (let index = 0; index < 49; index += 1) {
    const reachable = reachableRoadNodeIds(graph, ['a']);
    assert.equal(reachable, first);
    assert.equal(reachable.has('b'), true);
  }

  const previousRevision = graph.topologyRevision;
  mergeRoadGraphs(graph, extensionGraph(), { chunkId: '1:0' });
  const afterMerge = reachableRoadNodeIds(graph, ['a']);

  assert.ok(graph.topologyRevision > previousRevision);
  assert.notEqual(afterMerge, first);
  assert.equal(afterMerge.has('c-1:0'), true);
});

test('construction-site cache is invalidated when map expansion changes the topology', () => {
  const graph = baseGraph();
  const before = buildSitePlanner(graph);
  mergeRoadGraphs(graph, extensionGraph(), { chunkId: '1:0' });
  const after = buildSitePlanner(graph);

  assert.notEqual(after, before);
  assert.equal(after.tacticalSites.some(site => site.nodeId === 'c-1:0'), true);
});

test('cached combat reachability never suppresses player-triggered map expansion', () => {
  const store = storeForRoadExpansion();
  const graph = store.read(state => state.world.roadGraph);
  for (let index = 0; index < 100; index += 1) reachableRoadNodeIds(graph, ['a']);

  const queued = [];
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {} });
  manager.enqueue = (chunk, center, options) => {
    queued.push({ chunk, center, options });
    return Promise.resolve({ ok: true, chunkId: chunk.id });
  };
  const ids = manager.considerLocation({ lat: 35, lon: 139 });

  assert.ok(ids.includes('1:0'));
  assert.ok(queued.some(item => item.chunk.id === '1:0' && ['road-frontier', 'movement-lookahead'].includes(item.options.reason)));
});

test('selected-area confirmation waits for every required road chunk before succeeding', async () => {
  const store = storeForRoadExpansion();
  const calls = [];
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: {
      async loadChunk({ chunkId }) {
        calls.push(chunkId);
        return extensionGraph(chunkId);
      }
    }
  });

  const result = await manager.ensureAreaAroundPoint({ x: 590, y: 300 }, {
    radiusMeters: 30,
    observe: true,
    reason: 'initial-base-coverage'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(new Set(result.requested), new Set(['0:0', '1:0']));
  assert.deepEqual(new Set(calls), new Set(['1:0']));
  const chunks = store.read(state => state.world.roadChunks);
  assert.ok(chunks.loaded.includes('0:0'));
  assert.ok(chunks.loaded.includes('1:0'));
});

test('frontier waves blocked by the population cap do not consume a wave and retry soon', () => {
  const store = storeForRoadExpansion();
  const state = store.snapshot();
  state.runtime.worldTimeMs = 1000;
  state.world.frontierSources = [{
    id: 'frontier', point: { x: 900, y: 300 }, entryNodeId: 'b',
    direction: { x: 1, y: 0 }, profile: 'patrol', threat: 1,
    status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 300,
    spawnIntervalSec: 300, wavesSent: 0, createdAt: 1, clearedAt: null
  }];
  state.combat.enemies = Array.from({ length: 220 }, (_, index) => ({
    id: `capacity-${index}`, hp: 1, maxHp: 1, waveResolved: false, waveId: null
  }));
  const messages = [];
  const system = new FrontierSystem({ emit(type, payload) { if (type === 'message') messages.push(payload.text); } });

  system.update(state, 1);

  assert.equal(state.world.frontierSources[0].wavesSent, 0);
  assert.deepEqual(state.combat.waves.active, {});
  assert.equal(messages.some(message => message.includes('侵入しました')), false);
  assert.equal(state.world.frontierSources[0].spawnClock, 288);
});
