import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BuildSystem } from '../src/combat/build-system.js';
import { CombatUi } from '../src/ui/combat-ui.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { normalizeRuntimeState } from '../src/core/state-normalizer.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createInitialState } from '../src/core/state-schema.js';

const read = relative => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

function legacyOverlapState() {
  const state = createInitialState();
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }, { id: 'c', x: 60, y: 0 }, { id: 'd', x: 30, y: 30 }];
  const edges = [
    { id: 'ab', a: 'a', b: 'b', length: 30, roadWidth: 6 },
    { id: 'bc', a: 'b', b: 'c', length: 30, roadWidth: 6 },
    { id: 'bd', a: 'b', b: 'd', length: 30, roadWidth: 6 }
  ];
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, nodes, edges, source: 'test', roadSpecVersion: 4 });
  state.world.homeBase = { id: 'home', x: 0, y: 0, nodeId: 'a', hp: 100, maxHp: 100, status: 'ESTABLISHED', primary: true };
  state.world.playerBases = [{ ...state.world.homeBase }];
  state.world.city = { nodeId: 'a', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  state.inventory.resources.wood = 999;
  state.inventory.resources.stone = 999;
  state.inventory.resources.fiber = 999;
  state.combat.defenses = [
    { id: 'old-ruin-a', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0', nodeId: 'b', hp: 0, maxHp: 150, ruined: true, cooldown: 0, disabledTimer: 0 },
    { id: 'old-ruin-b', kind: 'tower', type: 'mortar', line: 'area', tier: 0, defenseKey: 'area0', nodeId: 'b', hp: 0, maxHp: 150, ruined: true, cooldown: 0, disabledTimer: 0 }
  ];
  return state;
}

test('legacy destroyed facilities are removed during normalization and free the placement', () => {
  const state = legacyOverlapState();
  normalizeRuntimeState(state);
  assert.equal(state.combat.defenses.length, 0);
  const preview = new BuildSystem().previewAt(state, 'mortar', { x: 30, y: 0 }, 5);
  assert.equal(preview.ok, true);
  assert.equal(preview.candidate.nodeId, 'b');
});

test('normalization keeps only one active facility when a legacy save overlaps placements', () => {
  const state = legacyOverlapState();
  state.combat.defenses.push(
    { id: 'older-active', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0', nodeId: 'b', hp: 100, maxHp: 150, cooldown: 0, disabledTimer: 0 },
    { id: 'newer-active', kind: 'tower', type: 'mortar', line: 'area', tier: 0, defenseKey: 'area0', nodeId: 'b', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0 }
  );
  normalizeRuntimeState(state);
  assert.deepEqual(state.combat.defenses.map(defense => defense.id), ['newer-active']);
  const nearest = CombatUi.prototype.nearestObject.call({}, state, { x: 30, y: 0 }, 5, null);
  assert.equal(nearest.id, 'newer-active');
});

test('a gate is deleted at zero HP and the attacking enemy continues through the opened road', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'base', x: 100, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'base', length: 100, roadWidth: 5 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, primary: true }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'source', type: 'barracks', nodeId: 'base', alive: true, wavesSent: 0 }];
  state.combat.defenses = [{ id: 'gate', kind: 'barrier', type: 'barrier', line: 'gate', isGate: true, edgeId: 'road', hp: 1, maxHp: 700, tier: 2, defenseKey: 'gate2' }];

  const enemy = spawnEnemy(state, state.world.enemyBases[0], 'infantry');
  const system = new EnemySystem();
  for (let step = 0; step < 400 && state.combat.defenses.length > 0; step += 1) system.update(state, 0.25);
  assert.equal(state.combat.defenses.length, 0);
  for (let step = 0; step < 200 && state.combat.enemies.includes(enemy); step += 1) system.update(state, 0.25);
  assert.ok(state.world.city.hp < 100, 'enemy should pass the removed gate and reach the city');
});

test('obsolete ruin UI and rendering code is removed', async () => {
  const renderer = await read('src/rendering/combat-renderer.js');
  const combatUi = await read('src/ui/combat-ui.js');
  assert.doesNotMatch(renderer, /drawRuinedDefense|drawRuinedGate|FIX|OPEN/);
  assert.doesNotMatch(combatUi, /残骸を撤去|破壊済み・敵通行可/);
});

test('HUD still reports repair demand only for surviving damaged facilities', async () => {
  const source = await read('src/ui/base-command-ui.js');
  const css = await read('src/styles/app.css');
  assert.match(source, /要修理 \$\{repairCount\}/);
  assert.match(source, /defense\.hp > 0 && defense\.hp < defense\.maxHp/);
  assert.match(css, /\.baseSummary\.has-repairs/);
});
