import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

function stateWithGraph() {
  const state = createInitialState();
  state.player.currentPosition = { lat: 35.123456, lon: 139.654321 };
  state.player.locationAccuracy = 4;
  state.player.worldPosition = { x: 50, y: 60 };
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'a', x: 0, y: 0 };
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }],
    edges: [{ id: 'e', a: 'a', b: 'b', length: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }]
  });
  return state;
}

test('save data remains JSON and graph indexes are reconstructed after load', () => {
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'test');
  repository.save(stateWithGraph());
  const loaded = repository.load();
  assert.ok(loaded);
  assert.equal(loaded.world.roadGraph.nodeById, undefined);
  assert.equal(loaded.player.currentPosition, null);
  assert.equal(loaded.player.locationAccuracy, null);
  assert.deepEqual(loaded.player.worldPosition, { x: 0, y: 0 });
  const graph = attachGraphIndexes(loaded.world.roadGraph);
  assert.equal(graph.nodeById.get('a').x, 0);
  assert.equal(graph.adjacency.get('a')[0].to, 'b');
});
