import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadService } from '../src/roads/road-service.js';

function makeGrid(center) {
  const elements = [];
  const spacing = 0.0015;
  let id = 1;
  for (let row = -3; row <= 3; row += 1) {
    elements.push({
      id: id++,
      tags: { highway: row === 0 ? 'primary' : 'residential', name: `row ${row}` },
      geometry: Array.from({ length: 7 }, (_, index) => ({ lat: center.lat + row * spacing, lon: center.lon + (index - 3) * spacing }))
    });
  }
  for (let column = -3; column <= 3; column += 1) {
    elements.push({
      id: id++,
      tags: { highway: column === 0 ? 'secondary' : 'residential', name: `column ${column}` },
      geometry: Array.from({ length: 7 }, (_, index) => ({ lat: center.lat + (index - 3) * spacing, lon: center.lon + column * spacing }))
    });
  }
  return { elements };
}

test('one RoadService load performs one acquisition and produces indexed graph data', async () => {
  const center = { lat: 35, lon: 139 };
  let calls = 0;
  const client = {
    async fetchRoads(lat, lon) {
      calls += 1;
      assert.equal(lat, center.lat);
      assert.equal(lon, center.lon);
      return makeGrid(center);
    }
  };
  const service = new RoadService(client);
  const graph = await service.loadAround(center);
  assert.equal(calls, 1);
  assert.ok(graph.nodes.length >= 14);
  assert.ok(graph.edges.length >= 16);
  assert.ok(graph.nodeById instanceof Map);
  assert.ok(graph.adjacency instanceof Map);
});
