import test from 'node:test';
import assert from 'node:assert/strict';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BasePlacementService } from '../src/base/base-placement-service.js';

const center = { lat: 35, lon: 139 };
const graph = attachGraphIndexes({
  center,
  source: 'test',
  roadSpecVersion: 1,
  nodes: [
    { id: 'a', x: 0, y: 0, lat: 35, lon: 139 },
    { id: 'b', x: 500, y: 0, lat: 35, lon: 139.0055 }
  ],
  edges: [{
    id: 'edge', a: 'a', b: 'b', length: 500,
    points: [{ x: 0, y: 0 }, { x: 500, y: 0 }],
    roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false
  }]
});

test('selection snaps to the existing graph and creates a base without refetching', () => {
  const service = new BasePlacementService(graph, center);
  const selection = service.findNearestRoad({ x: 250, y: 8 }, 20);
  assert.ok(selection);
  assert.equal(selection.edgeId, 'edge');
  assert.equal(selection.valid, true);
  const established = service.establishHomeBase(selection);
  const base = established.homeBase;
  assert.equal(base.edgeId, 'edge');
  assert.equal(base.status, 'ESTABLISHED');
  assert.equal(base.nodeId, established.graph.nodes.at(-1).id);
  assert.equal(established.graph.edges.length, 2);
  assert.equal(established.graph.adjacency.get(base.nodeId).length, 2);
});

test('a tap outside the road tolerance is rejected', () => {
  const service = new BasePlacementService(graph, center);
  assert.equal(service.findNearestRoad({ x: 250, y: 100 }, 20), null);
});
