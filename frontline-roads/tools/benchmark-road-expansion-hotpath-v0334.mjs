import { performance } from 'node:perf_hooks';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { RoadWorldManager, roadWorldId } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { createRoadChunkState } from '../src/roads/world-chunk-grid.js';

function largeRoadGraph(nodeCount) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push({ id: `node-${index}`, x: index * 10, y: (index % 7) * 2 });
    if (index === 0) continue;
    const vertical = ((index % 7) - ((index - 1) % 7)) * 2;
    edges.push({
      id: `edge-${index}`,
      a: `node-${index - 1}`,
      b: `node-${index}`,
      length: Math.hypot(10, vertical),
      roadWidth: 5
    });
  }
  return attachGraphIndexes({
    nodes,
    edges,
    center: { lat: 35, lon: 139 },
    source: 'benchmark',
    roadSpecVersion: 4,
    topologyRevision: 1
  });
}

function cachedChunk(chunkId, index) {
  const x = 20000 + index * 700;
  return attachGraphIndexes({
    nodes: [
      { id: `cached-${index}-a`, x, y: 0, chunkIds: [chunkId] },
      { id: `cached-${index}-b`, x: x + 500, y: 0, chunkIds: [chunkId] }
    ],
    edges: [{
      id: `cached-edge-${index}`,
      a: `cached-${index}-a`,
      b: `cached-${index}-b`,
      length: 500,
      roadWidth: 5,
      chunkIds: [chunkId]
    }],
    center: { lat: 35, lon: 139 },
    source: 'benchmark-cache',
    roadSpecVersion: 4,
    topologyRevision: 1,
    chunkId,
    cacheVersion: 4
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function measureLocationUpdates(nodeCount, rounds = 4, iterations = 500) {
  const measurements = [];
  for (let round = 0; round < rounds; round += 1) {
    const state = createInitialState();
    state.world.roadGraph = largeRoadGraph(nodeCount);
    state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['10:0'] });
    state.player.worldPosition = { x: 6000, y: 0 };
    const store = new StateStore(state, new EventBus());
    const manager = new RoadWorldManager({ store, cache: null, roadService: {} });
    manager.enqueue = () => {};
    const startedAt = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      const point = { x: 6000 + index % 3, y: 0 };
      store.advance(draft => {
        draft.player.worldPosition = point;
        draft.player.locationUpdatedAt = index;
      }, 'benchmark:location', { validate: false });
      manager.considerLocation(point);
    }
    measurements.push((performance.now() - startedAt) / iterations);
  }
  return {
    nodes: nodeCount,
    iterations,
    roundsMs: measurements.map(value => Number(value.toFixed(4))),
    medianPerUpdateMs: Number(median(measurements).toFixed(4))
  };
}

async function measureCachedRestore(rounds = 4, chunkCount = 12) {
  const measurements = [];
  for (let round = 0; round < rounds; round += 1) {
    const state = createInitialState();
    state.world.roadGraph = largeRoadGraph(3000);
    state.world.roadChunks = createRoadChunkState();
    const ids = Array.from({ length: chunkCount }, (_, index) => `${30 + index}:0`);
    state.world.roadChunks.cached = [...ids];
    const store = new StateStore(state, new EventBus());
    const cache = new MemoryRoadChunkCache();
    const worldId = roadWorldId(store.renderView().world.roadGraph);
    for (let index = 0; index < ids.length; index += 1) {
      await cache.put(worldId, ids[index], cachedChunk(ids[index], index));
    }
    const manager = new RoadWorldManager({ store, cache, roadService: {} });
    const startedAt = performance.now();
    const result = await manager.restoreCachedChunks();
    measurements.push({ ms: performance.now() - startedAt, restored: result.restored });
  }
  return {
    graphNodes: 3000,
    cachedChunks: chunkCount,
    rounds: measurements.map(item => ({ ms: Number(item.ms.toFixed(3)), restored: item.restored })),
    medianMs: Number(median(measurements.map(item => item.ms)).toFixed(3))
  };
}

const output = {
  benchmark: 'road-expansion-hotpath-v0.33.4',
  environment: { runtime: process.version, platform: process.platform, architecture: process.arch },
  locationUpdates: [],
  cachedRestore: null
};
for (const count of [2000, 5000, 10000]) output.locationUpdates.push(await measureLocationUpdates(count));
output.cachedRestore = await measureCachedRestore();
console.log(JSON.stringify(output, null, 2));
