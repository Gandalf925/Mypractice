import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineSimulator } from '../src/persistence/offline-simulator.js';

class CountingCombatSystem {
  update(state, seconds) {
    state.counter = (state.counter ?? 0) + seconds;
    state.statistics.kills += seconds >= 1 ? 1 : 0;
  }
}

test('offline simulation is bounded and reports the applied duration', () => {
  const state = {
    counter: 0,
    statistics: { kills: 0 },
    world: { city: { hp: 100 } },
    inventory: { resources: { wood: 0, stone: 0, fiber: 0 }, overflow: {}, capacity: {} },
    civilization: { level: 0 },
    combat: { enemies: [], defenses: [] },
    runtime: {}
  };
  const simulator = new OfflineSimulator({ combatSystem: new CountingCombatSystem(), maximumSeconds: 100, maximumIterations: 10 });
  const summary = simulator.simulate(state, 1000);
  assert.equal(summary.capped, true);
  assert.ok(summary.simulatedSeconds <= 100);
  assert.equal(summary.iterations, 10);
  assert.ok(state.counter > 0);
});

test('offline simulation advances the canonical world clock', () => {
  const state = {
    counter: 0,
    statistics: { kills: 0 },
    world: { city: { hp: 100 } },
    inventory: { resources: { wood: 0, stone: 0, fiber: 0 }, overflow: {}, capacity: {} },
    civilization: { level: 0 },
    combat: { enemies: [], defenses: [] },
    runtime: { worldTimeMs: 1000 }
  };
  const simulator = new OfflineSimulator({ combatSystem: new CountingCombatSystem(), maximumSeconds: 100 });
  simulator.simulate(state, 60);
  assert.equal(state.runtime.worldTimeMs, 61000);
});
