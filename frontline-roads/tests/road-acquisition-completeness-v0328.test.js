import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_CONFIG } from '../src/core/constants.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { EventBus } from '../src/core/event-bus.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';

import { OverpassClient } from '../src/roads/overpass-client.js';
import { isAllowedWay } from '../src/roads/road-filter.js';
import { RoadService } from '../src/roads/road-service.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { mergeRoadGraphs } from '../src/roads/graph-merge.js';
import { encodeRoadGraph, decodeRoadGraph } from '../src/persistence/road-graph-codec.js';
import { chunkFullyInsideCircle, createRoadChunkState, ensureRoadChunkState, parseChunkId } from '../src/roads/world-chunk-grid.js';
import { xyToLatLon } from '../src/location/location-privacy.js';

const CENTER = Object.freeze({ lat: 35, lon: 139 });

function location(x, y) {
  return xyToLatLon(x, y, CENTER);
}

function way({ id, highway, points, name = `road-${id}`, tags = {} }) {
  return {
    type: 'way',
    id,
    nodes: points.map((_, index) => id * 1000 + index),
    tags: { highway, name, ...tags },
    geometry: points.map(([x, y]) => location(x, y))
  };
}

function linePoints({ x0 = -500, x1 = 500, y = 0, step = 100 }) {
  const points = [];
  for (let x = x0; x <= x1; x += step) points.push([x, y]);
  return points;
}

function serviceFor(elements) {
  return new RoadService({
    async fetchRoads() { return { version: 0.6, elements }; }
  });
}

test('the unified Overpass query and parser include trunk and motorway classes', () => {
  const client = new OverpassClient({
    fetchImpl: async () => ({ ok: true, async json() { return { elements: [] }; } }),
    endpoints: ['https://fixture.test/api/interpreter'],
    sandboxJsonpImpl: null,
    preferenceStorage: null
  });
  const query = client.buildQuery(35, 139, 1000);
  assert.match(query, /motorway/);
  assert.match(query, /motorway_link/);
  assert.match(query, /trunk/);
  assert.match(query, /trunk_link/);
  assert.equal(isAllowedWay({ highway: 'motorway' }), true);
  assert.equal(isAllowedWay({ highway: 'trunk' }), true);
});

test('initial acquisition preserves a disconnected major road instead of keeping only the center component', async () => {
  const service = serviceFor([
    way({ id: 1, highway: 'residential', points: linePoints({ y: 0 }) }),
    way({ id: 2, highway: 'trunk', points: linePoints({ y: 420 }), name: 'national route' })
  ]);
  const graph = await service.loadAround(CENTER);
  assert.ok(graph.edges.some(edge => edge.highway === 'residential'));
  assert.ok(graph.edges.some(edge => edge.highway === 'trunk'));
  assert.equal(new Set(graph.edges.flatMap(edge => edge.sourceWayIds)).has('2'), true);
  assert.equal(graph.acquisitionReport.highwayWayCounts.trunk, 1);
});

test('parallel major carriageways remain separate physical roads', async () => {
  const service = serviceFor([
    way({ id: 10, highway: 'motorway', points: linePoints({ y: 80 }), name: 'expressway' }),
    way({ id: 11, highway: 'motorway', points: linePoints({ y: 96 }), name: 'expressway' })
  ]);
  const graph = await service.loadAround(CENTER);
  const motorwayEdges = graph.edges.filter(edge => edge.highway === 'motorway');
  assert.equal(motorwayEdges.length, 20);
  assert.deepEqual(new Set(motorwayEdges.flatMap(edge => edge.sourceWayIds)), new Set(['10', '11']));
});

test('chunk acquisition retains a sparse major road crossing the chunk boundary', async () => {
  const sparse = way({
    id: 20,
    highway: 'primary',
    points: [[200, 120], [1600, 120]],
    name: 'boundary arterial'
  });
  let request = null;
  const service = new RoadService({
    async fetchRoads(lat, lon, options) {
      request = { lat, lon, ...options };
      return { elements: [sparse] };
    }
  });
  const chunkCenter = location(900, 300);
  const graph = await service.loadChunk({ worldCenter: CENTER, chunkCenter, chunkId: '1:0' });
  assert.equal(request.queryShape, 'bbox');
  assert.equal(request.radiusMeters, ROAD_CONFIG.chunkFetchRadiusMeters);
  assert.ok(graph.edges.length > 0);
  assert.ok(graph.edges.every(edge => edge.highway === 'primary'));
  assert.ok(graph.nodes.some(node => node.x < 600));
  assert.ok(graph.nodes.some(node => node.x > 1200));
  assert.ok(graph.acquisitionReport.clippedSegmentCount >= 0);
});

test('source identities survive compact save encoding and prevent overlap duplication after restore', async () => {
  const service = serviceFor([
    way({ id: 30, highway: 'trunk', points: linePoints({ y: 0 }), name: 'persistent trunk' }),
    way({ id: 31, highway: 'residential', points: linePoints({ y: 200 }), name: 'persistent local' })
  ]);
  const original = await service.loadAround(CENTER);
  const restored = attachGraphIndexes(decodeRoadGraph(encodeRoadGraph(original)));
  const incoming = await service.loadAround(CENTER);
  const beforeEdges = restored.edges.length;
  const result = mergeRoadGraphs(restored, incoming, { chunkId: '0:0' });
  assert.equal(result.addedNodes, 0);
  assert.equal(result.addedEdges, 0);
  assert.equal(restored.edges.length, beforeEdges);
  assert.ok(result.mergedEdges > 0);
  assert.ok(restored.nodes.every(node => Array.isArray(node.sourceNodeIds)));
  assert.ok(restored.edges.every(edge => edge.sourceWayIds.length > 0));
});



test('initial acquisition marks edge chunks for refresh instead of treating partial circle coverage as complete', () => {
  const integrated = ['0:0', '1:0', '2:0'];
  const loaded = integrated.filter(id => chunkFullyInsideCircle(
    parseChunkId(id),
    { x: 0, y: 0 },
    ROAD_CONFIG.initialRetentionRadiusMeters
  ));
  const refresh = integrated.filter(id => !loaded.includes(id));
  const chunks = createRoadChunkState({
    initialLoadedChunkIds: loaded,
    initialIntegratedChunkIds: integrated,
    initialRefreshChunkIds: refresh
  });
  assert.ok(chunks.loaded.includes('0:0'));
  assert.ok(chunks.refresh.includes('2:0'));
  assert.ok(chunks.integrated.includes('2:0'));
  assert.ok(!chunks.loaded.includes('2:0'));
});

test('old road coverage is marked for reacquisition after the completeness specification changes', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: CENTER,
    source: 'old-road-map',
    roadSpecVersion: 2,
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 700, y: 0 }],
    edges: [{ id: 'ab', a: 'a', b: 'b', length: 700, highway: 'primary', roadWidth: 10, lanes: 2 }]
  });
  state.world.roadChunks = {
    version: 3,
    sizeMeters: 600,
    loaded: ['0:0', '1:0'],
    empty: ['2:0'],
    cached: ['0:0', '1:0'],
    integrated: ['0:0', '1:0'],
    playerObserved: ['0:0'],
    surveyed: [],
    failed: { '1:0': { at: Date.now(), message: 'old failure' } },
    updatedAt: Date.now()
  };
  const chunks = ensureRoadChunkState(state.world);
  assert.equal(chunks.version, 4);
  assert.equal(chunks.acquisitionSpecVersion, 3);
  assert.deepEqual(new Set(chunks.refresh), new Set(['0:0', '1:0']));
  assert.deepEqual(chunks.empty, []);
  assert.deepEqual(chunks.cached, []);
  assert.deepEqual(chunks.failed, {});
});

test('a migrated loaded chunk is fetched again and its refresh marker is cleared only after integration', async () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: CENTER,
    source: 'old-road-map',
    roadSpecVersion: 2,
    nodes: [{ id: 'old-a', x: 0, y: 0 }, { id: 'old-b', x: 500, y: 0 }],
    edges: [{ id: 'old-ab', a: 'old-a', b: 'old-b', length: 500, highway: 'primary', roadWidth: 10, lanes: 2 }]
  });
  state.world.roadChunks = {
    version: 3,
    sizeMeters: 600,
    loaded: ['0:0'],
    empty: [],
    cached: ['0:0'],
    integrated: ['0:0'],
    playerObserved: ['0:0'],
    surveyed: [],
    failed: {},
    updatedAt: Date.now()
  };
  ensureRoadChunkState(state.world);
  const store = new StateStore(state, new EventBus());
  let calls = 0;
  const incoming = attachGraphIndexes({
    center: CENTER,
    source: 'osm-chunk',
    roadSpecVersion: 3,
    chunkId: '0:0',
    nodes: [
      { id: 'fresh-a', x: 0, y: 100, sourceNodeIds: ['9001'], chunkIds: ['0:0'] },
      { id: 'fresh-b', x: 500, y: 100, sourceNodeIds: ['9002'], chunkIds: ['0:0'] }
    ],
    edges: [{
      id: 'fresh-edge', a: 'fresh-a', b: 'fresh-b', length: 500,
      highway: 'trunk', roadWidth: 12, lanes: 2, sourceWayIds: ['900'], chunkIds: ['0:0']
    }]
  });
  Object.defineProperty(incoming, 'acquisitionReport', {
    value: { responseElements: 1, acceptedWays: 1, excludedWays: 0, retainedSegmentCount: 1 },
    enumerable: false
  });
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: {
      overpassClient: { getLastSuccess: () => ({ sequence: 1, host: 'fixture', transport: 'POST', elementCount: 1 }) },
      async loadChunk() { calls += 1; return incoming; }
    }
  });
  await manager.loadChunk(parseChunkId('0:0'), CENTER, { mode: 'movement' });
  const after = store.snapshot();
  assert.equal(calls, 1);
  assert.ok(!after.world.roadChunks.refresh.includes('0:0'));
  assert.ok(after.world.roadGraph.edges.some(edge => edge.highway === 'trunk'));
  assert.equal(after.world.roadChunks.lastAcquisition.acceptedWays, 1);
  assert.equal(after.world.roadChunks.lastAcquisition.addedEdges, 1);
});
