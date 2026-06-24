import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BuildSystem } from '../src/combat/build-system.js';
import { CombatUi } from '../src/ui/combat-ui.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createInitialState } from '../src/core/state-schema.js';

const read = relative => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

function stateWithRuinedTower() {
  const state = createInitialState();
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }, { id: 'c', x: 60, y: 0 }];
  const edges = [{ id: 'ab', a: 'a', b: 'b', length: 30, roadWidth: 6 }, { id: 'bc', a: 'b', b: 'c', length: 30, roadWidth: 6 }];
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, nodes, edges, source: 'test', roadSpecVersion: 4 });
  state.world.homeBase = { id: 'home', x: 0, y: 0, nodeId: 'a', hp: 100, maxHp: 100, status: 'ESTABLISHED', primary: true };
  state.world.playerBases = [{ ...state.world.homeBase }];
  state.world.city = { nodeId: 'a', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  state.civilization.level = 0;
  state.inventory.resources.wood = 999;
  state.inventory.resources.stone = 999;
  state.inventory.resources.fiber = 999;
  state.combat.defenses = [{ id: 'ruin', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0', nodeId: 'b', hp: 0, maxHp: 150, ruined: true, cooldown: 0, disabledTimer: 0 }];
  return state;
}

test('ruined facilities keep occupying their road location until repaired or removed', () => {
  const state = stateWithRuinedTower();
  const system = new BuildSystem();
  const sites = system.listBuildSites(state, 'mortar');
  assert.equal(sites.some(site => site.nodeId === 'b'), false);
  const result = system.validateCandidate(state, { type: 'mortar', kind: 'tower', nodeId: 'b', point: { x: 30, y: 0 } }, { checkResources: false });
  assert.equal(result.ok, false);
  assert.match(result.reason, /残骸/);
});

test('HUD uses a content-sized resource strip and explains headquarters durability', async () => {
  const html = await read('index.html');
  const css = await read('src/styles/app.css');
  const combatUi = await read('src/ui/combat-ui.js');
  assert.match(html, /class=["']hudHeader["']/);
  assert.match(html, /本拠地HP/);
  assert.match(css, /\.resourceSummary\s*\{[\s\S]*display:\s*flex/);
  assert.doesNotMatch(css, /\.resourceSummary\s*\{[^}]*max-height:\s*58px/s);
  assert.match(combatUi, /cityHp\.textContent = `\$\{Math\.ceil\(state\.world\.city\?\.hp/);
});

test('destroyed defenses remain visible and map markers use the canonical facility icon', async () => {
  const renderer = await read('src/rendering/combat-renderer.js');
  assert.match(renderer, /defenseRuntimeDefinition\(defense\)/);
  assert.match(renderer, /drawRuinedDefense/);
  assert.match(renderer, /fillText\(icon/);
  assert.doesNotMatch(renderer, /if \(defense\.hp <= 0 \|\| defense\.ruined\) continue/);
});

test('top summary exposes repair demand prominently', async () => {
  const source = await read('src/ui/base-command-ui.js');
  const css = await read('src/styles/app.css');
  assert.match(source, /要修理 \$\{repairCount\}/);
  assert.match(source, /classList\?\.toggle\('has-repairs'/);
  assert.match(css, /\.baseSummary\.has-repairs/);
});


test('legacy overlapping facilities select the active facility first and allow cycling to the ruin', () => {
  const state = stateWithRuinedTower();
  state.combat.defenses.push({ id: 'active', kind: 'tower', type: 'mortar', line: 'area', tier: 0, defenseKey: 'area0', nodeId: 'b', hp: 150, maxHp: 150, ruined: false, cooldown: 0, disabledTimer: 0 });
  const nearestObject = CombatUi.prototype.nearestObject;
  const first = nearestObject.call({}, state, { x: 30, y: 0 }, 5, null);
  const second = nearestObject.call({}, state, { x: 30, y: 0 }, 5, first);
  assert.equal(first.id, 'active');
  assert.equal(second.id, 'ruin');
});
