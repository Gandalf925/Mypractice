import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkForLocation,
  chunkForWorldPoint,
  chunkCenterLocation,
  createRoadChunkState,
  parseChunkId
} from '../src/roads/world-chunk-grid.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { mergeRoadGraphs } from '../src/roads/graph-merge.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { RoadService } from '../src/roads/road-service.js';

function graph(nodes, edges) {
  return attachGraphIndexes({ nodes, edges, center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2 });
}

function edge(id, a, b, length = 100) {
  return { id, a, b, length, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false };
}

function makeGrid(center) {
  const elements = [];
  let id = 100;
  const spacing = 0.001;
  for (let row = -2; row <= 2; row += 1) {
    elements.push({
      id: id++,
      tags: { highway: 'residential', name: `row ${row}` },
      geometry: Array.from({ length: 5 }, (_, index) => ({ lat: center.lat + row * spacing, lon: center.lon + (index - 2) * spacing }))
    });
  }
  for (let column = -2; column <= 2; column += 1) {
    elements.push({
      id: id++,
      tags: { highway: 'residential', name: `column ${column}` },
      geometry: Array.from({ length: 5 }, (_, index) => ({ lat: center.lat + (index - 2) * spacing, lon: center.lon + column * spacing }))
    });
  }
  return { elements };
}

test('world chunks use deterministic grid ids and reversible centers', () => {
  const worldCenter = { lat: 35, lon: 139 };
  const chunk = chunkForWorldPoint({ x: 601, y: -1 });
  assert.deepEqual(chunk, { x: 1, y: -1, id: '1:-1' });
  assert.deepEqual(parseChunkId(chunk.id), chunk);
  const location = chunkCenterLocation(chunk, worldCenter);
  assert.equal(chunkForLocation(location, worldCenter).id, chunk.id);
});

test('initial chunk state does not assume that the cleaned initial graph fully covers surrounding chunks', () => {
  const state = createRoadChunkState();
  assert.equal(state.version, 4);
  assert.deepEqual(state.loaded, []);
  assert.deepEqual(state.playerObserved, []);
});

test('graph merge preserves existing ids, joins nearby endpoints and removes duplicate edges', () => {
  const base = graph([
    { id: 'base-a', x: 0, y: 0 },
    { id: 'base-b', x: 100, y: 0 }
  ], [edge('base-edge', 'base-a', 'base-b')]);
  const incoming = graph([
    { id: 'node_0', x: 99, y: 1 },
    { id: 'node_1', x: 200, y: 0 },
    { id: 'node_2', x: 1, y: 1 }
  ], [
    edge('incoming-next', 'node_0', 'node_1'),
    edge('incoming-duplicate', 'node_2', 'node_0')
  ]);
  const result = mergeRoadGraphs(base, incoming, { chunkId: '1:0' });
  assert.equal(result.addedNodes, 1);
  assert.equal(result.addedEdges, 1);
  assert.equal(result.mergedEdges, 1);
  assert.equal(base.nodes.find(node => node.id === 'base-b').id, 'base-b');
  assert.equal(base.edges.length, 2);
  assert.ok(base.adjacency.get('base-b').some(item => item.to !== 'base-a'));
});

test('chunk cache isolates worlds and can remove one world', async () => {
  const cache = new MemoryRoadChunkCache();
  await cache.put('world-a', '0:0', { nodes: [1] });
  await cache.put('world-b', '0:0', { nodes: [2] });
  assert.deepEqual(await cache.get('world-a', '0:0'), { nodes: [1] });
  await cache.removeWorld('world-a');
  assert.equal(await cache.get('world-a', '0:0'), null);
  assert.deepEqual(await cache.get('world-b', '0:0'), { nodes: [2] });
});

test('RoadService chunk acquisition projects roads into the original world coordinate system', async () => {
  const worldCenter = { lat: 35, lon: 139 };
  const chunkCenter = { lat: 35, lon: 139.01 };
  let request = null;
  const service = new RoadService({
    async fetchRoads(lat, lon, options) {
      request = { lat, lon, radiusMeters: options.radiusMeters, queryShape: options.queryShape };
      return makeGrid(chunkCenter);
    }
  });
  const chunkGraph = await service.loadChunk({ worldCenter, chunkCenter, chunkId: '1:0', radiusMeters: 500 });
  assert.deepEqual(request, { lat: chunkCenter.lat, lon: chunkCenter.lon, radiusMeters: 500, queryShape: 'bbox' });
  assert.ok(chunkGraph.nodes.length > 0);
  assert.ok(chunkGraph.nodes.some(node => node.x > 700));
  assert.ok(chunkGraph.nodes.every(node => node.chunkIds.includes('1:0')));
});
