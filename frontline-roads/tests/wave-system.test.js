import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { WaveSystem, spawnEnemyBaseGuard } from '../src/combat/wave-system.js';
import { damageEnemy } from '../src/combat/enemy-system.js';

function longRoadState() {
  const state = createInitialState();
  const nodes = Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`, x: index * 100, y: 0 }));
  const edges = Array.from({ length: 10 }, (_, index) => ({ id: `e${index}`, a: `n${index}`, b: `n${index + 1}`, length: 100 }));
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1, nodes, edges });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'n0', x: 0, y: 0 };
  state.world.city = { nodeId: 'n0', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'normal', type: 'barracks', nodeId: 'n2', alive: true, level: 1, wavesSent: 0, ageSeconds: 0, spawnClock: 0 }];
  ensureCivilizationState(state, { initializeInventory: true });
  return state;
}

test('a fully destroyed wave increments perfect defense streak exactly once', () => {
  const state = longRoadState();
  const waves = new WaveSystem();
  waves.spawnWave(state, state.world.enemyBases[0]);
  const enemies = [...state.combat.enemies];
  for (const enemy of enemies) damageEnemy(state, enemy, 9999);
  assert.equal(state.civilization.progress.perfectWaveStreak, 1);
  for (const enemy of enemies) damageEnemy(state, enemy, 9999);
  assert.equal(state.civilization.progress.perfectWaveStreak, 1);
});


test('enemy-base guard launches once and does not count as a perfect defense wave', () => {
  const state = longRoadState();
  const base = state.world.enemyBases[0];
  const first = spawnEnemyBaseGuard(state, base);
  const second = spawnEnemyBaseGuard(state, base);
  assert.equal(first, 3);
  assert.equal(second, 0);
  assert.equal(base.wavesSent, 0);
  assert.equal(state.combat.enemies.length, 3);
  const record = Object.values(state.combat.waves.active)[0];
  assert.equal(record.guard, true);
  for (const enemy of [...state.combat.enemies]) damageEnemy(state, enemy, 9999);
  assert.equal(state.civilization.progress.perfectWaveStreak, 0);
  assert.deepEqual(state.combat.waves.active, {});
});

test('civilization level creates resource bases without duplicating them', () => {
  const state = longRoadState();
  state.civilization.level = 2;
  const waves = new WaveSystem();
  waves.ensureUnlockedBases(state);
  const types = state.world.enemyBases.map(base => base.type);
  assert.ok(types.includes('copperCamp'));
  assert.ok(types.includes('tinCamp'));
  const count = state.world.enemyBases.length;
  waves.ensureUnlockedBases(state);
  assert.equal(state.world.enemyBases.length, count);
});


test('initial base placement excludes civilization resource bases', async () => {
  const { selectEnemyBasePlacements } = await import('../src/combat/combat-initializer.js');
  const state = longRoadState();
  const types = selectEnemyBasePlacements(state.world.roadGraph, state.world.city.nodeId).map(item => item.type);
  assert.deepEqual(types.filter(type => ['copperCamp', 'tinCamp', 'ironCamp', 'bronzeCamp', 'siegeWorks'].includes(type)), []);
});

test('destroyed base waits for its respawn timer and then reappears elsewhere', () => {
  const state = longRoadState();
  state.world.enemyBases[0].alive = false;
  state.world.baseRespawns = [{ id: 'respawn-1', baseType: 'barracks', sourceNodeId: 'n2', remainingSec: 1, attempts: 0 }];
  const waves = new WaveSystem();
  waves.update(state, 2);
  assert.equal(state.world.baseRespawns.length, 0);
  const replacement = state.world.enemyBases.find(base => base.alive && base.type === 'barracks');
  assert.ok(replacement);
  assert.notEqual(replacement.nodeId, 'n2');
});

test('initial enemy bases spread across independent road fronts when the graph permits it', async () => {
  const { selectEnemyBasePlacements } = await import('../src/combat/combat-initializer.js');
  const nodes = [{ id: 'home', x: 0, y: 0 }];
  const edges = [];
  for (const [prefix, dx, dy] of [['east', 1, 0], ['west', -1, 0], ['north', 0, -1], ['south', 0, 1]]) {
    let previous = 'home';
    for (let index = 1; index <= 12; index += 1) {
      const id = `${prefix}-${index}`;
      nodes.push({ id, x: dx * index * 50, y: dy * index * 50 });
      edges.push({ id: `${prefix}-road-${index}`, a: previous, b: id, length: 50 });
      previous = id;
    }
  }
  const graph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1, nodes, edges });
  const placements = selectEnemyBasePlacements(graph, 'home');
  assert.equal(placements.length, 4);
  assert.equal(new Set(placements.map(item => item.sector)).size, 4);
  assert.deepEqual(placements.map(item => item.initialDelayBonusSec), [0, 0, 0, 0]);
});

test('stacked initial enemy bases receive progressively longer opening delays on a one-front road', async () => {
  const { selectEnemyBasePlacements, initializeCombatState } = await import('../src/combat/combat-initializer.js');
  const state = longRoadState();
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'n0', x: 0, y: 0 };
  const placements = selectEnemyBasePlacements(state.world.roadGraph, 'n0');
  assert.deepEqual(placements.map(item => item.frontIndex), [0, 1, 2, 3]);
  assert.deepEqual(placements.map(item => item.initialDelayBonusSec), [0, 120, 240, 360]);
  assert.deepEqual(placements.map(item => item.frontPressureMultiplier), [1, 1.5, 2, 2.5]);
  initializeCombatState(state);
  const firstWaveDelays = state.world.enemyBases.map(base => {
    const definition = {
      barracks: { interval: 180 }, engineer: { interval: 300 }, raider: { interval: 360 }, motor: { interval: 420 }
    }[base.type];
    return definition.interval - base.spawnClock;
  });
  assert.deepEqual(firstWaveDelays, [90, 270, 420, 600]);
});

test('a full enemy population does not consume an enemy-base wave or announce a false launch', () => {
  const state = longRoadState();
  state.runtime.createdAt = 1;
  state.runtime.worldTimeMs = 2;
  state.combat.enemies = Array.from({ length: 220 }, (_, index) => ({
    id: `capacity-${index}`, hp: 1, maxHp: 1, waveResolved: false, waveId: null
  }));
  const messages = [];
  const events = { emit(type, payload) { if (type === 'message') messages.push(payload.text); } };
  const waves = new WaveSystem(events);
  const base = state.world.enemyBases[0];
  base.spawnClock = 1_000_000;

  waves.update(state, 1);

  assert.equal(base.wavesSent, 0);
  assert.deepEqual(state.combat.waves.active, {});
  assert.equal(messages.some(message => message.includes('開始しました')), false);
  assert.ok(base.spawnClock > 0 && base.spawnClock < 1_000_000);
});

test('a guard wave blocked by the population cap remains eligible for a later launch', () => {
  const state = longRoadState();
  state.combat.enemies = Array.from({ length: 220 }, (_, index) => ({
    id: `capacity-${index}`, hp: 1, maxHp: 1, waveResolved: false, waveId: null
  }));
  const base = state.world.enemyBases[0];

  assert.equal(spawnEnemyBaseGuard(state, base), 0);
  assert.equal(base.guardWaveTriggered, undefined);
  assert.equal(base.wavesSent, 0);
  assert.deepEqual(state.combat.waves.active, {});
});
