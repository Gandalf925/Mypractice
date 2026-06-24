import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { DefenseSystem } from '../src/combat/defense-system.js';
import { EnemySystem } from '../src/combat/enemy-system.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { OfflineSimulator } from '../src/persistence/offline-simulator.js';

function lineState(lengths = [100]) {
  const state = createInitialState();
  const nodes = [{ id: 'home', x: 0, y: 0 }];
  const edges = [];
  let x = 0;
  let previous = 'home';
  lengths.forEach((length, index) => {
    x += length;
    const id = `n${index + 1}`;
    nodes.push({ id, x, y: 0 });
    edges.push({ id: `e${index + 1}`, a: previous, b: id, length, roadWidth: 5 });
    previous = id;
  });
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'offline-equivalence-test', roadSpecVersion: 4,
    nodes, edges
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [];
  state.world.frontierSources = [];
  state.world.explorationSites = [];
  state.combat.enemies = [];
  state.combat.defenses = [];
  state.combat.friendlySquads = [];
  state.combat.waves.active = {};
  state.combat.waves.resourceBaseCheckClock = -1_000_000;
  state.runtime.regionalSimulation = { peripheralAccumulator: 0, dormantAccumulator: 0 };
  return state;
}

function stationaryEnemy(id = 'enemy') {
  return {
    id, type: 'infantry', level: 1, hp: 1000, maxHp: 1000, radius: 4.5,
    nodeId: 'home', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0,
    sourceBaseId: null, waveId: null, doctrineKey: 'frontal', waveResolved: false,
    rewardGranted: false, reroutePending: false, routeBias: 1,
    targetDefenseId: null, targetFieldBaseId: null, targetPlayerBaseId: null,
    targetSquadId: null, notifiedDefenseIds: [], engagedSquadId: null
  };
}

function gunTower() {
  return {
    id: 'gun', kind: 'tower', type: 'gun', line: 'single', tier: 0,
    nodeId: 'home', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0, ruined: false
  };
}

function runFixed(system, state, totalSeconds, stepSeconds) {
  const iterations = Math.round(totalSeconds / stepSeconds);
  for (let index = 0; index < iterations; index += 1) system.update(state, stepSeconds);
}

test('tower reload preserves elapsed remainder and gives the same result at 20 Hz or one coarse update', () => {
  const fine = lineState();
  const coarse = lineState();
  fine.combat.enemies.push(stationaryEnemy());
  coarse.combat.enemies.push(stationaryEnemy());
  fine.combat.defenses.push(gunTower());
  coarse.combat.defenses.push(gunTower());
  runFixed(new DefenseSystem(), fine, 10, 0.05);
  new DefenseSystem().update(coarse, 10);
  assert.equal(coarse.combat.enemies[0].hp, fine.combat.enemies[0].hp);
  assert.ok(Math.abs(coarse.combat.defenses[0].cooldown - fine.combat.defenses[0].cooldown) < 1e-8);
});

test('enemy departure delay and road-edge overflow are consumed in the same update', () => {
  const fine = lineState([0.2, 0.2, 0.2, 0.2, 2]);
  const coarse = structuredClone(fine);
  attachGraphIndexes(coarse.world.roadGraph);
  const enemy = {
    ...stationaryEnemy(), hp: 50, maxHp: 50, nodeId: 'home', departDelay: 0.25,
    path: {
      nodeIds: ['home', 'n1', 'n2', 'n3', 'n4', 'n5'],
      edgeIds: ['e1', 'e2', 'e3', 'e4', 'e5'],
      targetId: 'n5'
    },
    edgeId: 'e1'
  };
  fine.combat.enemies.push(structuredClone(enemy));
  coarse.combat.enemies.push(structuredClone(enemy));
  runFixed(new EnemySystem(), fine, 1, 0.05);
  new EnemySystem().update(coarse, 1);
  const left = fine.combat.enemies[0];
  const right = coarse.combat.enemies[0];
  assert.equal(right.nodeId, left.nodeId);
  assert.equal(right.edgeId, left.edgeId);
  assert.equal(right.pathIndex, left.pathIndex);
  assert.ok(Math.abs(right.edgeProgress - left.edgeProgress) < 1e-8);
  assert.equal(right.departDelay, 0);
});

test('offline 0.25-second simulation matches live 20 Hz for a deterministic defense interval', () => {
  const live = lineState();
  live.combat.enemies.push(stationaryEnemy());
  live.combat.defenses.push(gunTower());
  const offline = structuredClone(live);
  attachGraphIndexes(offline.world.roadGraph);

  const liveSystem = new CombatSystem();
  for (let index = 0; index < 1200; index += 1) {
    live.runtime.worldTimeMs += 50;
    liveSystem.update(live, 0.05);
  }
  const summary = new OfflineSimulator({ combatSystem: new CombatSystem() }).simulate(offline, 60);

  assert.equal(summary.iterations, 240);
  assert.equal(offline.combat.enemies[0].hp, live.combat.enemies[0].hp);
  assert.ok(Math.abs(offline.combat.defenses[0].cooldown - live.combat.defenses[0].cooldown) < 1e-8);
  assert.equal(offline.runtime.worldTimeMs, live.runtime.worldTimeMs);
});

