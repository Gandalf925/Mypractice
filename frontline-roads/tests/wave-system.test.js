import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { WaveSystem } from '../src/combat/wave-system.js';
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

test('captured base waits for its respawn timer and then reappears elsewhere', () => {
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
