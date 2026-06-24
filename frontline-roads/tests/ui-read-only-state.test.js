import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventBus } from '../src/core/event-bus.js';
import { StateStore } from '../src/core/state-store.js';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState, CivilizationSystem } from '../src/civilization/civilization-system.js';
import { PlayerBaseSystem } from '../src/base/player-base-system.js';
import { FieldBaseSystem } from '../src/base/field-base-system.js';
import { FriendlyForceSystem } from '../src/combat/friendly-force-system.js';
import { BaseCommandUi } from '../src/ui/base-command-ui.js';
import { CivilizationUi } from '../src/ui/civilization-ui.js';
import { DeploymentUi } from '../src/ui/deployment-ui.js';

class FakeElement {
  constructor() {
    this.hidden = true;
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = {};
    this.attributes = new Map();
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function documentFixture() {
  const ids = [
    'baseCommandPanel', 'baseCommandBody', 'baseSummary', 'baseCommandButton', 'closeBaseCommand',
    'civilizationPanel', 'civilizationBody', 'resourceSummary', 'civilizationButton', 'closeCivilization',
    'deploymentPanel', 'deploymentTitle', 'deploymentBody', 'closeDeployment'
  ];
  const elements = new Map(ids.map(id => [`#${id}`, new FakeElement()]));
  return { elements, document: { querySelector(selector) { return elements.get(selector) ?? null; } } };
}

function playableState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'ui-read-only-test', roadSpecVersion: 4,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'enemy', x: 220, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'enemy', length: 220, roadWidth: 6 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1 }];
  state.runtime.combatInitialized = true;
  ensureCivilizationState(state, { initializeInventory: true });
  return state;
}

test('opening command, civilization and deployment UI does not mutate committed game state', () => {
  const priorDocument = globalThis.document;
  const { document } = documentFixture();
  globalThis.document = document;
  try {
    const store = new StateStore(playableState(), new EventBus());
    const renderer = { centerOn() {}, invalidateStatic() {}, render() {} };
    const notifications = { show() {} };
    const baseUi = new BaseCommandUi({
      store,
      playerBaseSystem: new PlayerBaseSystem(),
      fieldBaseSystem: new FieldBaseSystem(),
      renderer,
      notifications,
      persist() {}
    });
    const civilizationUi = new CivilizationUi({
      store,
      civilizationSystem: new CivilizationSystem(),
      notifications,
      persist() {}
    });
    const deploymentUi = new DeploymentUi({
      store,
      friendlyForceSystem: new FriendlyForceSystem(),
      notifications,
      persist() {}
    });

    const before = store.snapshot();
    baseUi.open();
    civilizationUi.open();
    assert.equal(deploymentUi.openForEnemyBase('enemy-base'), true);
    assert.deepEqual(store.snapshot(), before);
  } finally {
    globalThis.document = priorDocument;
  }
});

test('periodic HUD refresh shares one detached state snapshot across all UI panels', async () => {
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /onUiUpdate: \(\) => \{\s*const view = this\.store\.snapshot\(\);\s*this\.combatUi\.update\(view\);\s*this\.deploymentUi\.update\(view\);\s*this\.baseCommandUi\.update\(view\);\s*this\.civilizationUi\.update\(view\);/s);
});
