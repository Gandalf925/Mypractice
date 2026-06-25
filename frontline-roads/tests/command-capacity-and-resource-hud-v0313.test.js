import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  dispatchAssaultSquad,
  friendlySquadCapacityForBase,
  FRIENDLY_SQUAD_STATUS
} from '../src/combat/friendly-force-system.js';
import { RESOURCE_KEYS, SETTLEMENT_BUILDINGS } from '../src/civilization/data.js';
import { CivilizationUi } from '../src/ui/civilization-ui.js';

function fixture({ level = 0, origin = 'major' } = {}) {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'capacity-test', roadSpecVersion: 4,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'field', x: 100, y: 0 },
      { id: 'enemy', x: 300, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'field', length: 100, roadWidth: 6 },
      { id: 'b', a: 'field', b: 'enemy', length: 200, roadWidth: 6 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [{ id: 'field-base', kind: 'FIELD', name: '簡易拠点', status: 'ESTABLISHED', nodeId: 'field', x: 100, y: 0, hp: 40, maxHp: 40, establishedAt: 1 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 500, maxHp: 500, alive: true, level: 1 }];
  state.civilization.level = level;
  state.runtime.combatInitialized = true;
  state.inventory.capacity = { base: 9999, processed: 9999, ore: 9999, metal: 9999 };
  for (const key of RESOURCE_KEYS) state.inventory.resources[key] = 999;
  return { state, originBaseId: origin === 'field' ? 'field-base' : 'home-base' };
}

test('civilization level raises major and field base squad capacity', () => {
  const { state } = fixture({ level: 0 });
  const major = state.world.playerBases[0];
  const field = state.world.fieldBases[0];
  assert.equal(friendlySquadCapacityForBase(state, major), 2);
  assert.equal(friendlySquadCapacityForBase(state, field), 2);
  state.civilization.level = 1;
  assert.equal(friendlySquadCapacityForBase(state, major), 3);
  assert.equal(friendlySquadCapacityForBase(state, field), 2);
  state.civilization.level = 2;
  assert.equal(friendlySquadCapacityForBase(state, major), 4);
  assert.equal(friendlySquadCapacityForBase(state, field), 3);
  state.civilization.level = 4;
  assert.equal(friendlySquadCapacityForBase(state, major), 6);
  assert.equal(friendlySquadCapacityForBase(state, field), 4);
});

test('one major base can dispatch several squads until its civilization capacity is full', () => {
  const { state, originBaseId } = fixture({ level: 2 });
  for (let index = 0; index < 4; index += 1) {
    const result = dispatchAssaultSquad(state, originBaseId, 'enemy-base');
    assert.equal(result.ok, true, `dispatch ${index + 1} should fit`);
  }
  assert.equal(state.combat.friendlySquads.length, 4);
  const blocked = dispatchAssaultSquad(state, originBaseId, 'enemy-base');
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /部隊枠が満員/);
});

test('recovering squads occupy only their own slot and do not block other free slots', () => {
  const { state, originBaseId } = fixture({ level: 1 });
  state.combat.friendlySquads.push({
    id: 'recovering', type: 'assault', hp: 50, maxHp: 180, members: 6,
    originBaseId, nodeId: 'home', status: FRIENDLY_SQUAD_STATUS.RECOVERING,
    order: 'RETURN', missionType: 'ATTACK', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0
  });
  assert.equal(dispatchAssaultSquad(state, originBaseId, 'enemy-base').ok, true);
  assert.equal(dispatchAssaultSquad(state, originBaseId, 'enemy-base').ok, true);
  const blocked = dispatchAssaultSquad(state, originBaseId, 'enemy-base');
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /3\/3/);
});

test('field bases also support multiple light squads according to civilization level', () => {
  const { state, originBaseId } = fixture({ level: 2, origin: 'field' });
  for (let index = 0; index < 3; index += 1) assert.equal(dispatchAssaultSquad(state, originBaseId, 'enemy-base').ok, true);
  assert.equal(dispatchAssaultSquad(state, originBaseId, 'enemy-base').ok, false);
});

test('every settlement building has a concise gameplay description', () => {
  for (const [type, definition] of Object.entries(SETTLEMENT_BUILDINGS)) {
    assert.equal(typeof definition.description, 'string', `${type} needs a description`);
    assert.ok(definition.description.length >= 12, `${type} description is too short`);
    assert.ok(definition.description.length <= 64, `${type} description is too long`);
  }
});

class FakeElement {
  constructor() { this.hidden = false; this.innerHTML = ''; this.attributes = new Map(); }
  addEventListener() {}
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

test('default resource HUD renders every owned resource as an independent chip', () => {
  const prior = globalThis.document;
  const elements = new Map(['civilizationPanel', 'civilizationBody', 'resourceSummary', 'civilizationButton', 'closeCivilization'].map(id => [`#${id}`, new FakeElement()]));
  globalThis.document = { querySelector(selector) { return elements.get(selector) ?? null; } };
  try {
    const { state } = fixture({ level: 4 });
    for (let index = 0; index < RESOURCE_KEYS.length; index += 1) state.inventory.resources[RESOURCE_KEYS[index]] = index + 1;
    const ui = new CivilizationUi({
      store: { snapshot() { return state; }, read(selector) { return selector(state); } },
      civilizationSystem: {}, notifications: { show() {} }, persist() {}
    });
    ui.updateSummary();
    const html = elements.get('#resourceSummary').innerHTML;
    for (const key of RESOURCE_KEYS) assert.match(html, new RegExp(`data-resource="${key}"`));
    assert.equal((html.match(/class="resourceChip"/g) ?? []).length, RESOURCE_KEYS.length);
    assert.ok(elements.get('#resourceSummary').attributes.get('aria-label')?.includes('鍛鉄'));
  } finally {
    globalThis.document = prior;
  }
});

test('resource HUD uses a non-overlapping content-sized scroll strip', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.hudHeader\s*\{[\s\S]*grid-template-areas:/s);
  assert.match(css, /\.resourceSummary\s*\{[\s\S]*display:\s*flex[\s\S]*overflow-x:\s*auto/s);
  assert.match(css, /@media \(max-width: 620px\) and \(orientation: portrait\)[\s\S]*\.hudHeader[\s\S]*"resources(?: resources)?"/s);
  assert.match(css, /\.resourceChip\s*\{[\s\S]*flex:\s*0 0 auto/s);
});
