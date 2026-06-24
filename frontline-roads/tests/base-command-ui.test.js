import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { PlayerBaseSystem } from '../src/base/player-base-system.js';
import { ensurePlayerBaseState } from '../src/base/player-bases.js';
import { BaseCommandUi, summarizePlayerBase } from '../src/ui/base-command-ui.js';

class FakeElement {
  constructor() { this.hidden = false; this.listeners = {}; this._html = ''; this.textContent = ''; }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
}

function fixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'remote', x: 400, y: 0 },
      { id: 'enemy', x: 430, y: 0 }
    ],
    edges: [
      { id: 'road-a', a: 'home', b: 'remote', length: 400, roadWidth: 5 },
      { id: 'road-b', a: 'remote', b: 'enemy', length: 30, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [
    { ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 },
    { id: 'remote-base', status: 'ESTABLISHED', nodeId: 'remote', x: 400, y: 0, name: '前線拠点 2', primary: false, hp: 80, maxHp: 100, establishedAt: 2 }
  ];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.civilization.level = 2;
  state.combat.enemies = [{ id: 'enemy-1', type: 'infantry', hp: 10, maxHp: 10, nodeId: 'enemy', edgeId: null, edgeProgress: 0, departDelay: 0 }];
  state.combat.defenses = [{ id: 'tower', kind: 'tower', type: 'gun', nodeId: 'remote', hp: 100, maxHp: 100, ruined: false }];
  state.world.recoveryItems = [{ id: 'item', nodeId: 'enemy', x: 430, y: 0, status: 'AVAILABLE', artifactType: 'commandSeal' }];
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, cutStone: 100, bronzeIngot: 100, wroughtIron: 100 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  ensurePlayerBaseState(state);
  return state;
}

function setupDocument() {
  const ids = ['baseCommandPanel', 'baseCommandBody', 'baseSummary', 'baseCommandButton', 'closeBaseCommand'];
  const elements = new Map(ids.map(id => [`#${id}`, new FakeElement()]));
  return { elements, document: { querySelector(selector) { return elements.get(selector) ?? null; } } };
}

test('base command panel summarizes remote threats, facilities, squads and recoveries', () => {
  const state = fixture();
  state.combat.friendlySquads = [{ id: 'squad', originBaseId: 'remote-base', hp: 100 }];
  const summary = summarizePlayerBase(state, state.world.playerBases[1]);
  assert.deepEqual(summary, { nearbyEnemies: 1, facilities: 1, squads: 1, squadCapacity: 4, activeSquads: 1, recoveringSquads: 0, readySquads: 0, recoveryItems: 1, alert: '交戦警戒' });
});

test('base command UI lists all bases and switches the map camera without moving the player', () => {
  const prior = globalThis.document;
  const { elements, document } = setupDocument();
  globalThis.document = document;
  try {
    const state = fixture();
    state.player.worldPosition = { x: 25, y: 10 };
    const originalPlayer = { ...state.player.worldPosition };
    let centered = null;
    const ui = new BaseCommandUi({
      store: { snapshot() { return state; }, read(selector) { return selector(state); }, transaction(mutator) { return mutator(state); } },
      playerBaseSystem: new PlayerBaseSystem(),
      renderer: { centerOn(point) { centered = point; }, invalidateStatic() {}, render() {} },
      notifications: { show() {} }, persist() {}
    });
    ui.open();
    const html = elements.get('#baseCommandBody').innerHTML;
    assert.match(html, /本拠地/);
    assert.match(html, /主要拠点 2/);
    assert.match(html, /この拠点をMAP表示/);
    ui.handleAction({ target: { closest() { return { dataset: { action: 'focus-base', baseId: 'remote-base' } }; } } });
    assert.equal(centered.id, 'remote-base');
    assert.deepEqual(state.player.worldPosition, originalPlayer);
    assert.match(elements.get('#baseSummary').textContent, /表示 主要拠点 2/);
  } finally { globalThis.document = prior; }
});

test('base command UI establishes an unlocked base at the current road position', () => {
  const prior = globalThis.document;
  const { document } = setupDocument();
  globalThis.document = document;
  try {
    const state = fixture();
    state.world.playerBases = [state.world.playerBases[0]];
    state.civilization.level = 1;
    state.player.worldPosition = { x: 400, y: 0 };
    state.player.locationUpdatedAt = Date.now();
    state.player.locationAccuracy = 8;
    const ui = new BaseCommandUi({
      store: { snapshot() { return state; }, read(selector) { return selector(state); }, transaction(mutator) { return mutator(state); } },
      playerBaseSystem: new PlayerBaseSystem(),
      renderer: { centerOn() {}, invalidateStatic() {}, render() {} },
      notifications: { show() {} }, persist() {}
    });
    ui.handleAction({ target: { closest() { return { dataset: { action: 'establish-base' } }; } } });
    assert.equal(state.world.playerBases.length, 2);
    assert.equal(state.world.playerBases[1].nodeId, 'remote');
  } finally { globalThis.document = prior; }
});

test('combat renderer includes a distinct marker for secondary player bases', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/rendering/combat-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /drawPlayerBase/);
  assert.match(source, /BASE/);
});

test('base command UI lists simple bases separately and can focus or rebuild a destroyed one', async () => {
  const prior = globalThis.document;
  const { elements, document } = setupDocument();
  globalThis.document = document;
  try {
    const { FieldBaseSystem } = await import('../src/base/field-base-system.js');
    const state = fixture();
    state.world.fieldBases = [{ id: 'field-1', kind: 'FIELD', name: '簡易拠点 1', status: 'DESTROYED', nodeId: 'remote', x: 400, y: 0, hp: 0, maxHp: 40, establishedAt: 3, destroyedAt: 4 }];
    state.player.worldPosition = { x: 400, y: 0 };
    state.player.locationUpdatedAt = Date.now();
    state.player.locationAccuracy = 8;
    let centered = null;
    const ui = new BaseCommandUi({
      store: { snapshot() { return state; }, read(selector) { return selector(state); }, transaction(mutator) { return mutator(state); } },
      playerBaseSystem: new PlayerBaseSystem(),
      fieldBaseSystem: new FieldBaseSystem(),
      renderer: { centerOn(point) { centered = point; }, invalidateStatic() {}, render() {} },
      notifications: { show() {} }, persist() {}
    });
    ui.open();
    assert.match(elements.get('#baseCommandBody').innerHTML, /簡易拠点 1/);
    assert.match(elements.get('#baseCommandBody').innerHTML, /現地で簡易拠点を再建/);
    ui.handleAction({ target: { closest() { return { dataset: { action: 'focus-base', baseId: 'field-1', baseKind: 'field' } }; } } });
    assert.equal(centered.id, 'field-1');
    ui.handleAction({ target: { closest() { return { dataset: { action: 'rebuild-field-base', baseId: 'field-1' } }; } } });
    assert.equal(state.world.fieldBases[0].status, 'ESTABLISHED');
    assert.equal(state.world.fieldBases[0].hp, 40);
  } finally { globalThis.document = prior; }
});

test('combat renderer includes a distinct marker for simple bases and ruins', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/rendering/combat-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /drawFieldBase/);
  assert.match(source, /FIELD/);
  assert.match(source, /RUIN/);
});
