import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { FriendlyForceSystem } from '../src/combat/friendly-force-system.js';

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

function uiFixture() {
  return new Map(['deploymentPanel','deploymentTitle','deploymentBody','closeDeployment'].map(id => [`#${id}`, new FakeElement()]));
}

test('top HUD no longer exposes a global deployment button', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="deploymentButton"/);
  assert.doesNotMatch(html, /DEPLOY\s*\/\/\s*派兵/);
});

test('enemy-base deployment opens with the tapped target fixed', async () => {
  const prior = globalThis.document;
  const state = fixture();
  const elements = uiFixture();
  globalThis.document = { querySelector(selector) { return elements.get(selector) ?? null; } };
  try {
    const { DeploymentUi } = await import('../src/ui/deployment-ui.js');
    const ui = new DeploymentUi({
      store: { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } },
      friendlyForceSystem: new FriendlyForceSystem(),
      notifications: { show() {} },
      persist() {}
    });
    assert.equal(ui.openForEnemyBase('target'), true);
    const html = elements.get('#deploymentBody').innerHTML;
    assert.equal(elements.get('#deploymentTitle').textContent, '選択敵拠点への派兵');
    assert.match(html, /選択中の目標/);
    assert.match(html, /前哨基地/);
    assert.match(html, /本拠地/);
    assert.match(html, /200m/);
    assert.match(html, /この敵拠点へ突撃部隊を派兵/);
    assert.match(html, /遊撃部隊/);
    assert.match(html, /攻城部隊/);
    assert.match(html, /重装部隊/);
    assert.match(html, /遠征部隊/);
    assert.doesNotMatch(html, /回収部隊/);
    assert.doesNotMatch(html, /data-action="select-target"/);
  } finally { globalThis.document = prior; }
});

test('recovery-item deployment keeps the selected item fixed and only offers retrieval squads', async () => {
  const prior = globalThis.document;
  const state = fixture();
  state.world.recoveryItems = [{
    id: 'artifact', sourceBaseId: 'destroyed-base', sourceBaseType: 'barracks', nodeId: 'enemy',
    x: 200, y: 0, artifactType: 'commandSeal', amount: 1, status: 'AVAILABLE', assignedSquadId: null
  }];
  const elements = uiFixture();
  globalThis.document = { querySelector(selector) { return elements.get(selector) ?? null; } };
  try {
    const { DeploymentUi } = await import('../src/ui/deployment-ui.js');
    const ui = new DeploymentUi({
      store: { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } },
      friendlyForceSystem: new FriendlyForceSystem(),
      notifications: { show() {} },
      persist() {}
    });
    assert.equal(ui.openForRecoveryItem('artifact'), true);
    const html = elements.get('#deploymentBody').innerHTML;
    assert.equal(elements.get('#deploymentTitle').textContent, '選択回収物への派遣');
    assert.match(html, /回収部隊/);
    assert.match(html, /敵指揮認証鍵/);
    assert.match(html, /確保後は拠点への帰還が必要/);
    assert.match(html, /回収部隊を派遣/);
    assert.doesNotMatch(html, /突撃部隊/);
    assert.doesNotMatch(html, /data-action="select-target"/);
  } finally { globalThis.document = prior; }
});

test('combat target context exposes direct deployment actions', async () => {
  const source = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  assert.match(source, /この敵拠点へ派兵/);
  assert.match(source, /openDeployment\?\.\(\{ kind: 'enemyBase'/);
  assert.match(source, /回収部隊を派遣/);
  assert.match(source, /openDeployment\?\.\(\{ kind: 'recoveryItem'/);
  assert.match(source, /is-target-mode/);
});

test('combat renderer includes visible friendly squad markers', async () => {
  const source = await readFile(new URL('../src/rendering/combat-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /friendlySquadPosition/);
  assert.match(source, /shortLabel/);
});
