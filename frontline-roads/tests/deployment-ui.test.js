import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { FriendlyForceSystem } from '../src/combat/friendly-force-system.js';

class FakeElement {
  constructor() { this.hidden = false; this.listeners = {}; this._html = ''; }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
}

function fixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'enemy', x: 200, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'enemy', length: 200, roadWidth: 5 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', hp: 100, maxHp: 100, primary: true }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'target', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1 }];
  Object.assign(state.inventory.resources, { wood: 200, stone: 200, fiber: 200 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('deployment UI shows origin, target, route and dispatch action', async () => {
  const prior = globalThis.document;
  const elements = new Map(['deploymentPanel','deploymentBody','deploymentButton','closeDeployment'].map(id => [`#${id}`, new FakeElement()]));
  globalThis.document = { querySelector(selector) { return elements.get(selector) ?? null; } };
  try {
    const { DeploymentUi } = await import('../src/ui/deployment-ui.js');
    const state = fixture();
    const ui = new DeploymentUi({
      store: { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } },
      friendlyForceSystem: new FriendlyForceSystem(),
      notifications: { show() {} },
      persist() {}
    });
    ui.open();
    const html = elements.get('#deploymentBody').innerHTML;
    assert.match(html, /本拠地/);
    assert.match(html, /前哨基地/);
    assert.match(html, /200m/);
    assert.match(html, /突撃部隊を派兵/);
    assert.match(html, /遊撃部隊/);
    assert.match(html, /攻城部隊/);
    assert.match(html, /重装部隊/);
    assert.match(html, /遠征部隊/);
    assert.match(html, /文明Lv\.4で解禁/);
  } finally { globalThis.document = prior; }
});


test('deployment UI switches to recovery targets for the retrieval squad', async () => {
  const prior = globalThis.document;
  const elements = new Map(['deploymentPanel','deploymentBody','deploymentButton','closeDeployment'].map(id => [`#${id}`, new FakeElement()]));
  globalThis.document = { querySelector(selector) { return elements.get(selector) ?? null; } };
  try {
    const { DeploymentUi } = await import('../src/ui/deployment-ui.js');
    const state = fixture();
    state.world.recoveryItems = [{
      id: 'artifact', sourceBaseId: 'destroyed-base', sourceBaseType: 'barracks', nodeId: 'enemy',
      x: 200, y: 0, artifactType: 'commandSeal', amount: 1, status: 'AVAILABLE', assignedSquadId: null
    }];
    const ui = new DeploymentUi({
      store: { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } },
      friendlyForceSystem: new FriendlyForceSystem(),
      notifications: { show() {} },
      persist() {}
    });
    ui.squadType = 'retrieval';
    ui.open();
    const html = elements.get('#deploymentBody').innerHTML;
    assert.match(html, /回収部隊/);
    assert.match(html, /回収目標/);
    assert.match(html, /敵指揮認証鍵/);
    assert.match(html, /現地回収後、拠点への帰還が必要/);
    assert.match(html, /回収部隊を派遣/);
    assert.doesNotMatch(html, /前哨基地<\/strong><span>HP/);
  } finally { globalThis.document = prior; }
});

test('combat renderer includes visible friendly squad markers', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/rendering/combat-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /friendlySquadPosition/);
  assert.match(source, /shortLabel/);
});
