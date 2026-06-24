import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { CivilizationSystem } from '../src/civilization/civilization-system.js';
import { OfflineSimulator } from '../src/persistence/offline-simulator.js';
import { MAX_ENEMIES } from '../src/combat/definitions.js';

function largeConnectedState() {
  const size = 9;
  const spacing = 100;
  const nodes = [];
  const edges = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      nodes.push({ id: `n${row}_${column}`, x: (column - 4) * spacing, y: (row - 4) * spacing });
    }
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (column < size - 1) edges.push({ id: `h${row}_${column}`, a: `n${row}_${column}`, b: `n${row}_${column + 1}`, length: spacing, roadWidth: 6 });
      if (row < size - 1) edges.push({ id: `v${row}_${column}`, a: `n${row}_${column}`, b: `n${row + 1}_${column}`, length: spacing, roadWidth: 6 });
    }
  }
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4, nodes, edges });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'n4_4', x: 0, y: 0 };
  initializeCombatState(state);
  return state;
}

test('twelve-hour simulation remains bounded, serializable and within enemy cap', () => {
  const state = largeConnectedState();
  const simulator = new OfflineSimulator({
    combatSystem: new CombatSystem(),
    civilizationSystem: new CivilizationSystem()
  });
  const summary = simulator.simulate(state, 12 * 60 * 60);
  assert.ok(Math.abs(summary.simulatedSeconds - 12 * 60 * 60) < 0.001);
  assert.ok(summary.iterations <= 200000);
  assert.ok(state.combat.enemies.length <= MAX_ENEMIES);
  assert.ok(Number.isFinite(state.world.city.hp));
  assert.ok(Number.isFinite(state.runtime.worldTimeMs));
  const serialized = JSON.stringify(state);
  assert.ok(serialized.length < 2_000_000, `save grew to ${serialized.length} bytes`);
  assert.doesNotMatch(serialized, /"adjacency"|"nodeById"|"edgeById"/);
});

test('same state and elapsed time produce the same offline game result', () => {
  const source = largeConnectedState();
  const first = structuredClone(source);
  const second = structuredClone(source);
  attachGraphIndexes(first.world.roadGraph);
  attachGraphIndexes(second.world.roadGraph);
  const createSimulator = () => new OfflineSimulator({
    combatSystem: new CombatSystem(),
    civilizationSystem: new CivilizationSystem()
  });
  createSimulator().simulate(first, 60 * 60);
  createSimulator().simulate(second, 60 * 60);
  delete first.runtime.lastOfflineSimulationAt;
  delete second.runtime.lastOfflineSimulationAt;
  assert.deepEqual(first, second);
});
