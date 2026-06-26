import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createRoadChunkState } from '../src/roads/world-chunk-grid.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { FrontierSystem, findFrontierCandidates, reconcileFrontiers } from '../src/exploration/frontier-system.js';
import { reconcileActiveWaveRecords } from '../src/combat/wave-system.js';

function edge(id, a, b, length) {
  return { id, a, b, length, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false };
}

function disconnectedFrontierState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'route-recovery-test', roadSpecVersion: 3,
    nodes: [
      { id: 'city', x: 0, y: 0 },
      { id: 'middle', x: 300, y: 0 },
      { id: 'connected-edge', x: 550, y: 0 },
      { id: 'orphan-inner', x: 300, y: 550 },
      { id: 'orphan-edge', x: 550, y: 550 }
    ],
    edges: [
      edge('home-a', 'city', 'middle', 300),
      edge('home-b', 'middle', 'connected-edge', 250),
      edge('orphan', 'orphan-inner', 'orphan-edge', 250)
    ]
  });
  state.world.city = { nodeId: 'city', hp: 100, maxHp: 100 };
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0 };
  state.world.playerBases = [{ id: 'home-base', status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0, hp: 100, maxHp: 100, primary: true }];
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.worldTimeMs = 100000;
  state.runtime.combatInitialized = true;
  return state;
}

test('frontier candidates exclude disconnected road fragments', () => {
  const state = disconnectedFrontierState();
  const candidates = findFrontierCandidates(state);
  assert.ok(candidates.some(candidate => candidate.nodeId === 'connected-edge'));
  assert.equal(candidates.some(candidate => candidate.nodeId === 'orphan-edge'), false);
  assert.equal(candidates.some(candidate => candidate.nodeId === 'orphan-inner'), false);
});

test('frontier reconciliation moves waiting enemies from a disconnected legacy entry to a reachable entry', () => {
  const state = disconnectedFrontierState();
  state.world.frontierSources = [{
    id: 'legacy-frontier', point: { x: 1200, y: 550 }, entryNodeId: 'orphan-edge',
    direction: { x: 1, y: 0 }, profile: 'siege', threat: 3,
    status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 0,
    spawnIntervalSec: 300, wavesSent: 1, createdAt: 1, discoveredAt: null, clearedAt: null
  }];
  state.combat.enemies = [{
    id: 'stalled', type: 'infantry', level: 1, hp: 60, maxHp: 60, radius: 5,
    nodeId: 'orphan-edge', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0,
    sourceBaseId: 'legacy-frontier', waveId: 'legacy-wave', doctrineKey: 'frontal',
    waveResolved: false, rewardGranted: false, reroutePending: false, routeFailureSeconds: 8,
    routeBias: 1, targetDefenseId: null, targetFieldBaseId: null,
    targetPlayerBaseId: null, targetSquadId: null, notifiedDefenseIds: [], engagedSquadId: null
  }];

  reconcileFrontiers(state);

  const source = state.world.frontierSources.find(item => item.id === 'legacy-frontier');
  assert.equal(source.entryNodeId, 'connected-edge');
  assert.equal(state.combat.enemies[0].nodeId, 'connected-edge');
  assert.equal(state.combat.enemies[0].routeFailureSeconds, 0);
  assert.equal(state.combat.enemies[0].reroutePending, true);
});

test('an enemy that cannot reach any settlement is retired instead of blocking the wave forever', () => {
  const state = disconnectedFrontierState();
  state.world.frontierSources = [];
  const enemy = spawnEnemy(state, { id: 'orphan-base', nodeId: 'orphan-edge', level: 1, wavesSent: 0 }, 'infantry', 0, 'stalled-wave');
  assert.ok(enemy);
  state.combat.waves.active = {
    'stalled-wave': { id: 'stalled-wave', baseId: 'orphan-base', remaining: 1, breached: false, guard: false }
  };
  const initialStreak = state.civilization.progress.perfectWaveStreak ?? 0;

  new EnemySystem(null).update(state, 46);

  assert.equal(state.combat.enemies.length, 0);
  assert.equal(state.combat.waves.active['stalled-wave'], undefined);
  assert.equal(state.civilization.progress.perfectWaveStreak ?? 0, initialStreak);
});

test('orphaned wave records are removed before they can suppress enemy-base spawning', () => {
  const state = disconnectedFrontierState();
  state.combat.waves.active = {
    orphanA: { id: 'orphanA', remaining: 4 },
    orphanB: { id: 'orphanB', remaining: 3 },
    live: { id: 'live', remaining: 99 }
  };
  state.combat.enemies = [{ id: 'live-enemy', hp: 10, waveId: 'live', waveResolved: false }];

  reconcileActiveWaveRecords(state);

  assert.deepEqual(Object.keys(state.combat.waves.active), ['live']);
  assert.equal(state.combat.waves.active.live.remaining, 1);
});


test('stalled frontier waves release the opening wave limit so a nearby enemy base resumes spawning', () => {
  const state = disconnectedFrontierState();
  state.runtime.createdAt = 1000;
  state.runtime.worldTimeMs = 1000;
  state.world.frontierSources = [];
  state.world.enemyBases = [{
    id: 'near-base', type: 'barracks', nodeId: 'middle', hp: 100, maxHp: 100,
    alive: true, level: 1, ageSeconds: 0, spawnClock: 1_000_000,
    initialDelayBonusSec: 0, frontPressureMultiplier: 1, wavesSent: 0, routeDistance: 300
  }];
  state.combat.enemies = [];
  state.combat.waves.active = {
    'stalled-a': { id: 'stalled-a', baseId: 'missing-source-a', remaining: 12, breached: false, guard: false },
    'stalled-b': { id: 'stalled-b', baseId: 'missing-source-b', remaining: 12, breached: false, guard: false }
  };
  for (let index = 0; index < 24; index += 1) {
    const waveId = index < 12 ? 'stalled-a' : 'stalled-b';
    const sourceBaseId = waveId === 'stalled-a' ? 'missing-source-a' : 'missing-source-b';
    const enemy = spawnEnemy(state, { id: sourceBaseId, nodeId: 'orphan-edge', level: 1, wavesSent: 0 }, 'infantry', 0, waveId);
    assert.ok(enemy);
  }

  const combat = new CombatSystem(null);
  for (let second = 0; second < 50; second += 1) {
    state.runtime.worldTimeMs += 1000;
    combat.update(state, 1);
  }

  assert.ok(state.world.enemyBases[0].wavesSent >= 1);
  assert.ok(state.combat.enemies.some(enemy => enemy.sourceBaseId === 'near-base'));
  assert.equal(state.combat.waves.active['stalled-a'], undefined);
  assert.equal(state.combat.waves.active['stalled-b'], undefined);
});


test('frontier spawning refuses a disconnected entry before creating enemies or wave records', () => {
  const state = disconnectedFrontierState();
  const source = {
    id: 'invalid-frontier', point: { x: 1200, y: 550 }, entryNodeId: 'orphan-edge',
    direction: { x: 1, y: 0 }, profile: 'patrol', threat: 1,
    status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 999,
    spawnIntervalSec: 300, wavesSent: 0, createdAt: 1
  };
  state.world.frontierSources = [source];

  const spawned = new FrontierSystem(null).spawnWave(state, source);

  assert.equal(spawned, false);
  assert.equal(state.combat.enemies.length, 0);
  assert.deepEqual(state.combat.waves.active, {});
  assert.equal(source.wavesSent, 0);
});

test('an enemy spawned on a reachable frontier entry receives a route and starts moving', () => {
  const state = disconnectedFrontierState();
  const enemy = spawnEnemy(state, { id: 'reachable-frontier', nodeId: 'connected-edge', level: 1, wavesSent: 0 }, 'infantry', 0, 'moving-wave');
  assert.ok(enemy);
  state.combat.waves.active = {
    'moving-wave': { id: 'moving-wave', baseId: 'reachable-frontier', remaining: 1, breached: false, guard: false }
  };

  new EnemySystem(null).update(state, 1);

  assert.equal(enemy.edgeId, 'home-b');
  assert.ok(enemy.edgeProgress > 0);
  assert.ok(enemy.path?.nodeIds.includes('city'));
  assert.equal(enemy.routeFailureSeconds, 0);
});

test('a missing live-wave record is reconstructed from surviving enemies', () => {
  const state = disconnectedFrontierState();
  state.world.frontierSources = [{
    id: 'frontier-record-source', point: { x: 1200, y: 0 }, entryNodeId: 'connected-edge',
    direction: { x: 1, y: 0 }, profile: 'raid', threat: 2,
    status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 0,
    spawnIntervalSec: 300, wavesSent: 1, createdAt: 1, discoveredAt: null, clearedAt: null
  }];
  state.combat.waves.active = {};
  state.combat.enemies = [{
    id: 'survivor', hp: 10, maxHp: 10, waveId: 'recovered-wave', waveResolved: false,
    sourceBaseId: 'frontier-record-source', frontierSourceId: 'frontier-record-source',
    doctrineKey: 'flank', waveGuard: false, waveStartedAt: 1234
  }];

  reconcileActiveWaveRecords(state);

  assert.deepEqual(state.combat.waves.active['recovered-wave'], {
    id: 'recovered-wave',
    baseId: 'frontier-record-source',
    frontierSourceId: 'frontier-record-source',
    remaining: 1,
    breached: false,
    guard: false,
    doctrineKey: 'flank',
    startedAt: 1234,
    recovered: true
  });
});

test('a departed enemy is not teleported when its frontier entry is repaired', () => {
  const state = disconnectedFrontierState();
  state.world.frontierSources = [{
    id: 'legacy-frontier', point: { x: 1200, y: 550 }, entryNodeId: 'orphan-edge',
    direction: { x: 1, y: 0 }, profile: 'siege', threat: 3,
    status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 0,
    spawnIntervalSec: 300, wavesSent: 1, createdAt: 1, discoveredAt: null, clearedAt: null
  }];
  state.combat.enemies = [{
    id: 'departed', type: 'infantry', level: 1, hp: 60, maxHp: 60, radius: 5,
    nodeId: 'orphan-inner', path: null, pathIndex: 1, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0,
    sourceBaseId: 'legacy-frontier', waveId: 'legacy-wave', doctrineKey: 'frontal',
    waveResolved: false, rewardGranted: false, reroutePending: true, routeFailureSeconds: 8,
    routeBias: 1, targetDefenseId: null, targetFieldBaseId: null,
    targetPlayerBaseId: null, targetSquadId: null, notifiedDefenseIds: [], engagedSquadId: null,
    hasDeparted: true
  }];

  reconcileFrontiers(state);

  assert.equal(state.world.frontierSources[0].entryNodeId, 'connected-edge');
  assert.equal(state.combat.enemies[0].nodeId, 'orphan-inner');
  assert.equal(state.combat.enemies[0].hasDeparted, true);
});

test('a route-less enemy already on a settlement-connected node is not silently deleted', () => {
  const state = disconnectedFrontierState();
  const enemy = spawnEnemy(state, { id: 'inside-source', nodeId: 'city', level: 1, wavesSent: 0 }, 'infantry', 0, 'inside-wave');
  assert.ok(enemy);
  state.combat.waves.active = {
    'inside-wave': { id: 'inside-wave', baseId: 'inside-source', remaining: 1, breached: false, guard: false }
  };

  new EnemySystem(null).update(state, 60);

  assert.equal(state.combat.enemies.includes(enemy), true);
  assert.equal(enemy.waveResolved, false);
  assert.equal(state.combat.waves.active['inside-wave'].remaining, 1);
});
