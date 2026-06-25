import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  add(...names) { const values = this.values(); names.forEach(name => values.add(name)); this.element.className = [...values].join(' '); }
  remove(...names) { const values = this.values(); names.forEach(name => values.delete(name)); this.element.className = [...values].join(' '); }
  toggle(name, force) { const values = this.values(); const enabled = force ?? !values.has(name); enabled ? values.add(name) : values.delete(name); this.element.className = [...values].join(' '); return enabled; }
}

class FakeElement {
  constructor() { this.children = []; this.dataset = {}; this.hidden = false; this.className = ''; this.listeners = {}; this.classList = new FakeClassList(this); this._text = ''; }
  set textContent(value) { this._text = String(value); if (value === '') this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html ?? ''; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this[name] = String(value); }
  click() { this.listeners.click?.({ currentTarget: this }); }
}

function makeDocument() {
  const ids = ['combatTools', 'cityHp', 'enemyCount', 'civilizationLevel', 'contextPanel', 'contextTitle', 'contextText', 'contextActions'];
  const elements = new Map(ids.map(id => [`#${id}`, new FakeElement()]));
  return {
    elements,
    querySelector(selector) { return elements.get(selector) ?? null; },
    createElement() { return new FakeElement(); }
  };
}

function makeState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'near', x: 60, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'near', length: 60, roadWidth: 5 }]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('map tap only selects a build candidate and confirmation performs the mutation', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  const { CombatUi } = await import('../src/ui/combat-ui.js');
  const state = makeState();
  const placements = [];
  const store = {
    snapshot() { return state; }, read(selector) { return selector(state); },
    transaction(mutator) { return mutator(state); }
  };
  const ui = new CombatUi({
    store,
    buildSystem: new BuildSystem(),
    civilizationSystem: {},
    camera: { scale: 1 },
    renderer: { setFocus() {}, setBuildPlacement(value) { placements.push(value); }, render() {} },
    notifications: { show() {} }
  });
  const before = { ...state.inventory.resources };

  ui.selectTool('gun');
  ui.handleMapTap({ x: 60, y: 0 });

  assert.equal(state.combat.defenses.length, 0);
  assert.deepEqual(state.inventory.resources, before);
  assert.equal(ui.buildCandidate.nodeId, 'near');
  assert.equal(placements.at(-1).candidate.nodeId, 'near');

  ui.confirmBuildCandidate();

  assert.equal(state.combat.defenses.length, 1);
  assert.equal(state.combat.defenses[0].nodeId, 'near');
  assert.equal(ui.buildCandidate, null);
  assert.ok(state.inventory.resources.wood < before.wood);
  globalThis.document = previousDocument;
});

test('combat UI no longer calls immediate buildAt from map taps', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.buildAt\(/);
  assert.match(source, /\.previewAt\(/);
  assert.match(source, /\.buildCandidate\(/);
});

test('an invalid second tap clears the previous candidate to prevent confirming the wrong location', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    const store = {
      snapshot() { return state; }, read(selector) { return selector(state); },
      transaction(mutator) { return mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: {},
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, render() {} },
      notifications: { show() {} }
    });

    ui.selectTool('gun');
    ui.handleMapTap({ x: 60, y: 0 });
    assert.equal(ui.buildCandidate.nodeId, 'near');

    ui.handleMapTap({ x: 200, y: 200 });

    assert.equal(ui.buildCandidate, null);
    assert.equal(state.combat.defenses.length, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('build confirmation is disabled while the selected facility is unaffordable', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    state.inventory.resources.wood = 0;
    const store = {
      snapshot() { return state; }, read(selector) { return selector(state); },
      transaction(mutator) { return mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: {},
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, render() {} },
      notifications: { show() {} }
    });

    ui.selectTool('gun');
    ui.handleMapTap({ x: 60, y: 0 });

    const confirm = document.elements.get('#contextActions').children[0];
    assert.equal(confirm.textContent, '資源不足');
    assert.equal(confirm.disabled, true);
  } finally {
    globalThis.document = previousDocument;
  }
});


test('context explanations are collapsed by default and metrics remain visible', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    const store = {
      snapshot() { return state; }, read(selector) { return selector(state); },
      transaction(mutator) { return mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: {},
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, render() {} },
      notifications: { show() {} }
    });

    ui.selectTool('gun');

    const content = document.elements.get('#contextText');
    assert.equal(content.children[0].className, 'contextMetricGrid');
    assert.equal(content.children[1].className, 'contextDisclosure');
    assert.equal(content.children[1].open, false);
    assert.equal(content.children[1].children[0].textContent, '説明を表示');
  } finally {
    globalThis.document = previousDocument;
  }
});


test('an opened context explanation remains open after the live HUD rerenders', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    const store = {
      snapshot() { return state; }, read(selector) { return selector(state); },
      transaction(mutator) { return mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: {},
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, render() {} },
      notifications: { show() {} }
    });

    ui.selectTool('gun');
    const firstDisclosure = document.elements.get('#contextText').children[1];
    firstDisclosure.open = true;
    firstDisclosure.listeners.toggle?.({ currentTarget: firstDisclosure });

    ui.renderContext();

    const rerenderedDisclosure = document.elements.get('#contextText').children[1];
    assert.equal(rerenderedDisclosure.open, true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('context metrics use a fixed three-column grid to reduce panel height', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /v0\.28\.5 persistent disclosure[\s\S]*?\.contextMetricGrid,[\s\S]*?grid-template-columns:\s*repeat\(3,/);
});


test('defense removal requires a second confirmation and then clears the selected facility', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    state.combat.defenses.push({ id: 'tower', kind: 'tower', type: 'gun', line: 'single', tier: 0, nodeId: 'near', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0 });
    let persisted = 0;
    let focus = null;
    const store = {
      snapshot() { return state; }, read(selector) { return selector(state); },
      transaction(mutator) { return mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: { progression: {} },
      camera: { scale: 1 },
      renderer: { setFocus(value) { focus = value; }, setBuildPlacement() {}, render() {} },
      notifications: { show() {} },
      persist() { persisted += 1; }
    });
    ui.selectedObject = { kind: 'defense', id: 'tower' };
    ui.renderContext();

    const firstRemoval = document.elements.get('#contextActions').children.find(button => button.textContent === '撤去');
    assert.ok(firstRemoval);
    firstRemoval.click();
    assert.equal(state.combat.defenses.length, 1);

    const confirm = document.elements.get('#contextActions').children.find(button => button.textContent === '撤去を確定（資源返還なし）');
    assert.ok(confirm);
    confirm.click();

    assert.equal(state.combat.defenses.length, 0);
    assert.equal(ui.selectedObject, null);
    assert.equal(focus, null);
    assert.equal(persisted, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('tapping the selected facility again closes the compact context panel', async () => {
  const previousDocument = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    state.combat.defenses.push({
      id: 'tower-close', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0',
      nodeId: 'near', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0
    });
    let focus = 'unset';
    const ui = new CombatUi({
      store: { snapshot() { return state; }, read(selector) { return selector(state); }, transaction(mutator) { return mutator(state); } },
      buildSystem: new BuildSystem(),
      civilizationSystem: { progression: {} },
      camera: { scale: 1 },
      renderer: { setFocus(value) { focus = value; }, setBuildPlacement() {}, setFriendlyOrderPlanning() {}, render() {} },
      notifications: { show() {} }
    });

    ui.handleMapTap({ x: 60, y: 0 });
    assert.equal(ui.selectedObject.kind, 'defense');
    assert.equal(ui.selectedObject.id, 'tower-close');
    assert.equal(document.elements.get('#contextPanel').hidden, false);

    ui.handleMapTap({ x: 60, y: 0 });
    assert.equal(ui.selectedObject, null);
    assert.equal(document.elements.get('#contextPanel').hidden, true);
    assert.equal(focus, null);
  } finally {
    globalThis.document = previousDocument;
  }
});
