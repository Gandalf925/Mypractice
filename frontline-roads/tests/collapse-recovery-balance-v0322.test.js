import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { applyCityDefeatRecovery, beginEnemyRegroup, enemyRegroupActive, RECOVERY_BALANCE } from '../src/core/recovery-balance.js';
import { WaveSystem } from '../src/combat/wave-system.js';
import { ProgressionSystem } from '../src/civilization/progression-system.js';
import { repairCostForDefense } from '../src/civilization/repair-cost.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { OfflineSimulator } from '../src/persistence/offline-simulator.js';

function stateFixture() {
  const state = createInitialState();
  const nodes = [{ id: 'home', x: 0, y: 0 }, { id: 'front', x: 200, y: 0 }];
  const edges = [{ id: 'road', a: 'home', b: 'front', length: 200, roadWidth: 6 }];
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'recovery-balance', roadSpecVersion: 4, nodes, edges });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  initializeCombatState(state);
  state.runtime.worldTimeMs = 100000;
  return state;
}

test('city defeat payment preserves the repair reserve and may pay only the safe surplus', () => {
  const state = stateFixture();
  state.inventory.resources.wood = 55;
  state.inventory.resources.stone = 44;
  const recovery = applyCityDefeatRecovery(state, true);
  assert.deepEqual(recovery.paid, { wood: 5, stone: 4 });
  assert.equal(recovery.fullyPaid, false);
  assert.equal(state.inventory.resources.wood, 50);
  assert.equal(state.inventory.resources.stone, 40);
  assert.equal(recovery.hp, 60);
});

test('enemy regroup deadlines extend but never shorten an existing recovery window', () => {
  const state = stateFixture();
  beginEnemyRegroup(state, 150);
  assert.equal(enemyRegroupActive(state), true);
  const first = state.combat.enemyRegroupUntil;
  beginEnemyRegroup(state, 30);
  assert.equal(state.combat.enemyRegroupUntil, first);
  state.runtime.worldTimeMs = first;
  assert.equal(enemyRegroupActive(state), false);
});

test('enemy bases pause their launch clock during regroup and resume afterward', () => {
  const state = stateFixture();
  state.world.enemyBases = [{ id: 'base', type: 'barracks', nodeId: 'front', hp: 100, maxHp: 100, alive: true, level: 1, ageSeconds: 0, spawnClock: 25, wavesSent: 0, routeDistance: 200, frontPressureMultiplier: 1 }];
  const base = state.world.enemyBases[0];
  beginEnemyRegroup(state, 150);
  new WaveSystem().update(state, 10);
  assert.equal(base.spawnClock, 25);
  state.runtime.worldTimeMs = state.combat.enemyRegroupUntil;
  new WaveSystem().update(state, 10);
  assert.equal(base.spawnClock, 35);
});

test('destroyed tower restoration costs fifty-five percent and needs a short restart', () => {
  const state = stateFixture();
  Object.assign(state.inventory.resources, { wood: 100, stone: 100, fiber: 100 });
  const tower = { id: 'gun', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0', nodeId: 'home', hp: 0, maxHp: 150, ruined: true, cooldown: 0, disabledTimer: 0 };
  state.combat.defenses.push(tower);
  assert.deepEqual(repairCostForDefense(tower, 150), { wood: 16, stone: 13, fiber: 5 });
  const result = new ProgressionSystem().repairDefense(state, tower.id);
  assert.equal(result.ok, true);
  assert.equal(tower.hp, tower.maxHp);
  assert.equal(tower.ruined, false);
  assert.equal(tower.disabledTimer, RECOVERY_BALANCE.restoredTowerRestartSeconds);
});

test('dedicated barrier repair costs remain unchanged', () => {
  const barrier = { id: 'wall', kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0, defenseKey: 'barrier0', edgeId: 'road', hp: 0, maxHp: 220, ruined: true };
  assert.deepEqual(repairCostForDefense(barrier, 220), { wood: 20, fiber: 8 });
});


test('regroup timing produces the same result in active and offline progression', () => {
  const create = () => {
    const state = stateFixture();
    state.world.enemyBases = [{ id: 'base', type: 'barracks', nodeId: 'front', hp: 100, maxHp: 100, alive: true, level: 1, ageSeconds: 0, spawnClock: 170, wavesSent: 0, routeDistance: 200, frontPressureMultiplier: 1 }];
    state.combat.waves.resourceBaseCheckClock = -1000;
    beginEnemyRegroup(state, 5);
    return state;
  };
  const active = create();
  const offline = create();
  const activeCombat = new CombatSystem();
  for (let index = 0; index < 80; index += 1) {
    active.runtime.worldTimeMs += 250;
    activeCombat.update(active, 0.25);
  }
  new OfflineSimulator({ combatSystem: new CombatSystem(), maximumStepSeconds: 0.25 }).simulate(offline, 20);
  assert.equal(offline.world.enemyBases[0].spawnClock, active.world.enemyBases[0].spawnClock);
  assert.equal(offline.combat.enemies.length, active.combat.enemies.length);
  assert.equal(offline.runtime.worldTimeMs, active.runtime.worldTimeMs);
});
