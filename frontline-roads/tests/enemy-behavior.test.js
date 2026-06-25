import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { findCombatPath } from '../src/combat/routing-system.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { BuildSystem } from '../src/combat/build-system.js';

function routingState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'a', x: 100, y: 0 },
      { id: 'b', x: 200, y: 0 },
      { id: 'c', x: 100, y: 100 },
      { id: 'base', x: 200, y: 100 }
    ],
    edges: [
      { id: 'ha', a: 'home', b: 'a', length: 100 },
      { id: 'ab', a: 'a', b: 'b', length: 100 },
      { id: 'ac', a: 'a', b: 'c', length: 150 },
      { id: 'cb', a: 'c', b: 'base', length: 150 },
      { id: 'bb', a: 'b', b: 'base', length: 100 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'source', type: 'barracks', nodeId: 'base', alive: true, wavesSent: 0 }];
  state.combat.defenses = [];
  return state;
}

function facilityState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'junction', x: 100, y: 0 },
      { id: 'base', x: 200, y: 0 },
      { id: 'north', x: 100, y: -100 },
      { id: 'south', x: 100, y: 100 }
    ],
    edges: [
      { id: 'home-junction', a: 'home', b: 'junction', length: 100 },
      { id: 'junction-base', a: 'junction', b: 'base', length: 100 },
      { id: 'junction-north', a: 'junction', b: 'north', length: 100 },
      { id: 'junction-south', a: 'junction', b: 'south', length: 100 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'source', type: 'raider', nodeId: 'base', alive: true, wavesSent: 0 }];
  state.combat.defenses = [];
  return state;
}

test('enemy types make different barrier decisions from break time and detour time', () => {
  const state = routingState();
  state.combat.defenses.push({ id: 'wall', kind: 'barrier', type: 'barrier', edgeId: 'ab', hp: 220, maxHp: 220 });

  const scout = findCombatPath(state, 'base', 'home', 'scout');
  const engineer = findCombatPath(state, 'base', 'home', 'engineer');
  const infantry = findCombatPath(state, 'base', 'home', 'infantry');

  assert.ok(!scout.edgeIds.includes('ab'));
  assert.ok(engineer.edgeIds.includes('ab'));
  assert.ok(!infantry.edgeIds.includes('ab'));
});

test('balanced infantry breaches a weakened wall instead of taking a long detour', () => {
  const state = routingState();
  state.combat.defenses.push({ id: 'wall', kind: 'barrier', type: 'barrier', edgeId: 'ab', hp: 40, maxHp: 220 });

  const path = findCombatPath(state, 'base', 'home', 'infantry');

  assert.ok(path.edgeIds.includes('ab'));
});

test('raider selects repair support before ordinary weapon towers', () => {
  const state = facilityState();
  state.combat.defenses.push(
    { id: 'relay', kind: 'tower', type: 'relay', nodeId: 'north', hp: 180, maxHp: 180, disabledTimer: 0 },
    { id: 'gun', kind: 'tower', type: 'gun', nodeId: 'south', hp: 160, maxHp: 160, disabledTimer: 0 }
  );
  const enemy = spawnEnemy(state, state.world.enemyBases[0], 'raider');

  new EnemySystem().update(state, 0.1);

  assert.equal(enemy.targetDefenseId, 'relay');
  assert.equal(enemy.path.targetObjectId, 'relay');
});

test('rope cutter selects slowing equipment before repair support', () => {
  const state = facilityState();
  state.combat.defenses.push(
    { id: 'relay', kind: 'tower', type: 'relay', nodeId: 'north', hp: 180, maxHp: 180, disabledTimer: 0 },
    { id: 'slow', kind: 'tower', type: 'slow', nodeId: 'south', hp: 140, maxHp: 140, disabledTimer: 0 }
  );
  const enemy = spawnEnemy(state, state.world.enemyBases[0], 'ropeCutter');

  new EnemySystem().update(state, 0.1);

  assert.equal(enemy.targetDefenseId, 'slow');
});

test('specialist damages its selected facility and invalidates shared targets when it is destroyed', () => {
  const state = facilityState();
  const relay = { id: 'relay', kind: 'tower', type: 'relay', nodeId: 'base', hp: 5, maxHp: 180, disabledTimer: 0 };
  state.combat.defenses.push(relay);
  const first = spawnEnemy(state, state.world.enemyBases[0], 'raider');
  const second = spawnEnemy(state, state.world.enemyBases[0], 'raider');
  first.targetDefenseId = relay.id;
  second.targetDefenseId = relay.id;

  new EnemySystem().update(state, 1);

  assert.equal(state.combat.defenses.some(defense => defense.id === relay.id), false);
  assert.equal(first.targetDefenseId, null);
  assert.equal(second.targetDefenseId, null);
  assert.equal(relay.disabledTimer, 8);
  assert.equal(state.combat.enemyRegroupUntil, state.runtime.worldTimeMs + 150000);
});


test('a newly built priority facility requests rerouting without teleporting an enemy off its current road', () => {
  const state = facilityState();
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  const enemy = spawnEnemy(state, state.world.enemyBases[0], 'raider');
  const enemies = new EnemySystem();
  enemies.update(state, 1);
  const edgeBefore = enemy.edgeId;
  const progressBefore = enemy.edgeProgress;

  state.player.worldPosition = { x: 100, y: -100 };
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'relay', { x: 100, y: -100 }, 5);
  const result = build.buildCandidate(state, preview.candidate);

  assert.equal(result.ok, true);
  assert.equal(enemy.reroutePending, true);
  assert.equal(enemy.edgeId, edgeBefore);
  assert.equal(enemy.edgeProgress, progressBefore);

  enemies.update(state, 1);
  assert.equal(enemy.edgeId, edgeBefore);
  assert.ok(enemy.edgeProgress > progressBefore);
});
