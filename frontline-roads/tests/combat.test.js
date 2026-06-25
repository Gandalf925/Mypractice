import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { findCombatPath } from '../src/combat/routing-system.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { EnemySystem, enemyPosition, spawnEnemy } from '../src/combat/enemy-system.js';
import { DefenseSystem } from '../src/combat/defense-system.js';

function makeState() {
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
      { id: 'ha', a: 'home', b: 'a', length: 100, roadWidth: 5 },
      { id: 'ab', a: 'a', b: 'b', length: 100, roadWidth: 5 },
      { id: 'ac', a: 'a', b: 'c', length: 150, roadWidth: 5 },
      { id: 'cb', a: 'c', b: 'base', length: 150, roadWidth: 5 },
      { id: 'bb', a: 'b', b: 'base', length: 100, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'source', type: 'barracks', nodeId: 'base', alive: true, wavesSent: 0 }];
  state.combat.defenses = [];
  state.combat.enemies = [];
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('barrier changes weighted enemy route without creating another graph', () => {
  const state = makeState();
  const before = findCombatPath(state, 'base', 'home', 'infantry');
  assert.ok(before.edgeIds.includes('ab'));
  state.combat.defenses.push({ id: 'wall', kind: 'barrier', type: 'barrier', edgeId: 'ab', hp: 220, maxHp: 220 });
  const after = findCombatPath(state, 'base', 'home', 'infantry');
  assert.ok(!after.edgeIds.includes('ab'));
  assert.ok(after.edgeIds.includes('ac'));
});

test('enemy position follows path direction rather than edge storage direction', () => {
  const state = makeState();
  const enemy = {
    id: 'e', type: 'infantry', hp: 50, maxHp: 50, nodeId: 'base',
    path: { nodeIds: ['base', 'b'], edgeIds: ['bb'], targetId: 'home' },
    pathIndex: 0, edgeId: 'bb', edgeProgress: 25, slowTimer: 0, departDelay: 0
  };
  const position = enemyPosition(state, enemy);
  assert.deepEqual(position, { x: 200, y: 75 });
});

test('build range is measured from established home base', () => {
  const state = makeState();
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'gun', { x: 2, y: 1 }, 10);
  const result = build.buildCandidate(state, preview.candidate);
  assert.equal(result.ok, true);
  assert.equal(state.inventory.resources.wood, 472);
  assert.equal(state.inventory.resources.stone, 478);
  assert.equal(state.inventory.resources.fiber, 492);
});

test('gun tower damages an enemy in range', () => {
  const state = makeState();
  state.combat.defenses.push({ id: 'gun', kind: 'tower', type: 'gun', nodeId: 'home', hp: 160, maxHp: 160, cooldown: 0, disabledTimer: 0 });
  const base = state.world.enemyBases[0];
  const enemy = spawnEnemy(state, base, 'infantry', 0);
  enemy.nodeId = 'home';
  enemy.path = null;
  enemy.edgeId = null;
  const system = new DefenseSystem();
  system.update(state, 0.1);
  assert.equal(enemy.hp, 45);
});

test('enemy reaching the city deals damage and is removed', () => {
  const state = makeState();
  const base = state.world.enemyBases[0];
  const enemy = spawnEnemy(state, base, 'infantry', 0);
  enemy.nodeId = 'a';
  enemy.path = { nodeIds: ['a', 'home'], edgeIds: ['ha'], targetId: 'home' };
  enemy.pathIndex = 0;
  enemy.edgeId = 'ha';
  enemy.edgeProgress = 99.9;
  const system = new EnemySystem();
  system.update(state, 1);
  assert.equal(state.world.city.hp, 92);
  assert.equal(state.combat.enemies.length, 0);
});


test('repair relay consumes resources and repairs only the most damaged target', () => {
  const state = makeState();
  state.inventory.resources.wood = 100;
  state.inventory.resources.stone = 100;
  state.inventory.resources.fiber = 100;
  state.combat.defenses.push(
    { id: 'relay', kind: 'tower', type: 'relay', line: 'repair', tier: 0, nodeId: 'a', hp: 180, maxHp: 180, cooldown: 0, disabledTimer: 0 },
    { id: 'gun-a', kind: 'tower', type: 'gun', line: 'single', tier: 0, nodeId: 'home', hp: 50, maxHp: 150, cooldown: 0, disabledTimer: 0 },
    { id: 'gun-b', kind: 'tower', type: 'gun', line: 'single', tier: 0, nodeId: 'b', hp: 120, maxHp: 150, cooldown: 0, disabledTimer: 0 }
  );
  const before = { ...state.inventory.resources };
  const system = new DefenseSystem();
  system.update(state, 0.1);
  assert.ok(state.combat.defenses.find(item => item.id === 'gun-a').hp > 50);
  assert.equal(state.combat.defenses.find(item => item.id === 'gun-b').hp, 120);
  assert.ok(state.inventory.resources.wood < before.wood || state.inventory.resources.stone < before.stone || state.inventory.resources.fiber < before.fiber);
});


test('city recovers after a quiet period and a large update only heals post-cooldown time', async () => {
  const { CombatSystem } = await import('../src/combat/combat-system.js');
  const state = makeState();
  state.world.enemyBases = [];
  state.combat.waves.resourceBaseCheckClock = -1000;
  state.world.city.hp = 40;
  state.combat.cityRecoveryCooldown = 75;
  const system = new CombatSystem();
  system.update(state, 180);
  assert.ok(Math.abs(state.world.city.hp - 52.6) < 0.0001);
  assert.equal(state.combat.cityRecoveryCooldown, 0);
  system.update(state, 690);
  assert.equal(state.world.city.hp, 100);
});

test('city defeat never creates negative resources and reports unpaid emergency recovery honestly', async () => {
  const { CombatSystem } = await import('../src/combat/combat-system.js');
  const state = makeState();
  state.world.enemyBases[0].spawnClock = 40;
  state.world.city.hp = 0;
  state.inventory.resources.wood = 0;
  state.inventory.resources.stone = 0;
  const messages = [];
  const system = new CombatSystem({ emit(type, payload) { if (type === 'message') messages.push(payload.text); } });
  system.update(state, 0.1);
  assert.equal(state.world.city.hp, 60);
  assert.equal(state.inventory.resources.wood, 0);
  assert.equal(state.inventory.resources.stone, 0);
  assert.equal(state.combat.cityRecoveryCooldown, 75);
  assert.equal(state.world.enemyBases[0].spawnClock, 0);
  assert.equal(state.combat.enemyRegroupUntil, state.runtime.worldTimeMs + 210000);
  assert.match(messages.at(-1), /使い切らず|修理余力/);
});
