import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { CivilizationSystem, ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { DEFENSE_LINES } from '../src/civilization/data.js';
import {
  applyDefenseTier,
  defenseTierMaxHp,
  defenseUpgradeStatus,
  synchronizeDefenseTier
} from '../src/civilization/defense-upgrade.js';
import { defenseRuntimeDefinition } from '../src/combat/definitions.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { DefenseSystem } from '../src/combat/defense-system.js';
import { spawnEnemy } from '../src/combat/enemy-system.js';

function makeState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'road-node', x: 40, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'road-node', length: 40 }]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.playerBases = [{ id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100, primary: true }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  ensureCivilizationState(state, { initializeInventory: true });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

function gunDefense(overrides = {}) {
  return {
    id: 'gun-1', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0',
    nodeId: 'road-node', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0, ruined: false,
    ...overrides
  };
}

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  add(...names) { const values = this.values(); names.forEach(name => values.add(name)); this.element.className = [...values].join(' '); }
  remove(...names) { const values = this.values(); names.forEach(name => values.delete(name)); this.element.className = [...values].join(' '); }
  toggle(name, force) { const values = this.values(); const enabled = force ?? !values.has(name); enabled ? values.add(name) : values.delete(name); this.element.className = [...values].join(' '); return enabled; }
}

class FakeElement {
  constructor() { this.children = []; this.dataset = {}; this.hidden = false; this.className = ''; this.listeners = {}; this.classList = new FakeClassList(this); this._text = ''; this.disabled = false; }
  set textContent(value) { this._text = String(value); if (value === '') this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html ?? ''; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click() { this.listeners.click?.({ currentTarget: this, target: this }); }
  setAttribute(name, value) { this[name] = String(value); }
}

function flattenText(element) {
  return [element.textContent, ...element.children.flatMap(child => flattenText(child))].join(' ');
}

function makeCombatDocument() {
  const ids = ['combatTools', 'cityHp', 'enemyCount', 'civilizationLevel', 'contextPanel', 'contextTitle', 'contextText', 'contextActions'];
  const elements = new Map(ids.map(id => [`#${id}`, new FakeElement()]));
  return {
    elements,
    querySelector(selector) { return elements.get(selector) ?? null; },
    createElement() { return new FakeElement(); }
  };
}

function makeCivilizationDocument() {
  const ids = ['civilizationPanel', 'civilizationBody', 'resourceSummary', 'civilizationButton', 'closeCivilization'];
  const elements = new Map(ids.map(id => [`#${id}`, new FakeElement()]));
  return {
    elements,
    querySelector(selector) { return elements.get(selector) ?? null; },
    createElement() { return new FakeElement(); }
  };
}

test('all defense tiers define deterministic durability and sequential upgrade costs', () => {
  for (const line of ['barrier', 'single', 'area', 'slow', 'repair']) {
    assert.equal(DEFENSE_LINES[line].length, 5);
    for (let tier = 0; tier <= 4; tier += 1) {
      const definition = DEFENSE_LINES[line][tier];
      assert.ok(definition, `${line} tier ${tier}`);
      assert.ok(definition.hp > 0, `${line} tier ${tier} hp`);
      if (tier === 0) assert.ok(definition.cost);
      else assert.ok(definition.upgrade);
    }
  }
  assert.equal(DEFENSE_LINES.gate[0], null);
  assert.equal(DEFENSE_LINES.gate[1], null);
  assert.ok(DEFENSE_LINES.gate[2].hp > 0);
});

test('defense upgrades are sequential and locked to civilization level', () => {
  const state = makeState();
  const defense = gunDefense();
  state.combat.defenses.push(defense);
  let status = defenseUpgradeStatus(state, defense);
  assert.equal(status.ok, false);
  assert.equal(status.requiredCivilizationLevel, 1);
  assert.match(status.reason, /文明Lv\.1/);

  state.civilization.level = 2;
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, stone: 100, cutStone: 100 });
  status = defenseUpgradeStatus(state, defense);
  assert.equal(status.ok, true);
  assert.equal(status.nextTier, 1);

  const system = new CivilizationSystem();
  assert.equal(system.progression.upgradeDefense(state, defense.id).ok, true);
  assert.equal(defense.tier, 1);
  assert.equal(defense.defenseKey, 'single1');
  assert.equal(defenseUpgradeStatus(state, defense).nextTier, 2);
});

test('upgrading preserves damage ratio instead of fully healing the facility', () => {
  const state = makeState();
  state.civilization.level = 1;
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, stone: 100 });
  const defense = gunDefense({ hp: 75 });
  state.combat.defenses.push(defense);
  const result = new CivilizationSystem().progression.upgradeDefense(state, defense.id);
  assert.equal(result.ok, true);
  assert.equal(defense.maxHp, 180);
  assert.equal(defense.hp, 90);
  assert.equal(defenseRuntimeDefinition(defense).damage, 7);
  assert.equal(defenseRuntimeDefinition(defense).range, 85);
});

test('tier synchronization upgrades legacy durability without changing its health percentage', () => {
  const defense = gunDefense({ tier: 2, defenseKey: 'single2', hp: 75, maxHp: 150 });
  synchronizeDefenseTier(defense);
  assert.equal(defense.maxHp, 225);
  assert.equal(defense.hp, 113);
  assert.equal(defense.defenseKey, 'single2');
});

test('destroyed and maximum-tier defenses cannot be upgraded', () => {
  const state = makeState();
  state.civilization.level = 4;
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, stone: 100, cutStone: 100, wroughtIron: 100 });
  const destroyed = gunDefense({ hp: 0, ruined: true });
  assert.match(defenseUpgradeStatus(state, destroyed).reason, /先に修理/);
  const maximum = gunDefense({ tier: 4, defenseKey: 'single4', hp: 350, maxHp: 350 });
  const status = defenseUpgradeStatus(state, maximum);
  assert.equal(status.atMax, true);
  assert.match(status.reason, /最高Tier/);
});

test('gate conversion starts at tier two and preserves the prior health ratio', () => {
  const state = makeState();
  state.civilization.level = 4;
  Object.assign(state.inventory.resources, { cutStone: 100, timber: 100, rope: 100 });
  const barrier = {
    id: 'wall', kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0, defenseKey: 'barrier0',
    edgeId: 'road', hp: 110, maxHp: 220, ruined: false, isGate: false
  };
  state.combat.defenses.push(barrier);
  const result = new CivilizationSystem().progression.convertBarrierToGate(state, barrier.id);
  assert.equal(result.ok, true);
  assert.equal(barrier.tier, 2);
  assert.equal(barrier.defenseKey, 'gate2');
  assert.equal(barrier.maxHp, 700);
  assert.equal(barrier.hp, 350);
});

test('combat UI keeps the normal facility panel compact and opens upgrade details only on demand', async () => {
  const previousDocument = globalThis.document;
  const document = makeCombatDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    state.civilization.level = 1;
    Object.assign(state.inventory.resources, { timber: 100, rope: 100, stone: 100 });
    const defense = gunDefense();
    state.combat.defenses.push(defense);
    const store = {
      select(selector) { return selector(state); },
      mutate(mutator) { mutator(state); }
    };
    const ui = new CombatUi({
      store,
      buildSystem: new BuildSystem(),
      civilizationSystem: new CivilizationSystem(),
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, setFriendlyOrderPlanning() {}, render() {} },
      notifications: { show() {} }
    });
    ui.selectedObject = { kind: 'defense', id: defense.id };
    ui.renderContext();

    assert.match(document.elements.get('#contextTitle').textContent, /投石台/);
    const compactText = flattenText(document.elements.get('#contextText'));
    assert.doesNotMatch(compactText, /強化投石台/);
    assert.doesNotMatch(compactText, /加工木材 5/);
    assert.equal(document.elements.get('#contextPanel').classList.values().has('is-defense-summary'), true);

    const buttons = document.elements.get('#contextActions').children;
    const upgrade = buttons.find(button => button.textContent === '強化');
    assert.ok(upgrade);
    assert.equal(upgrade.disabled, false);
    upgrade.click();

    const previewText = flattenText(document.elements.get('#contextText'));
    assert.match(previewText, /強化投石台/);
    assert.match(previewText, /加工木材 5/);
    assert.match(previewText, /5 → 7/);
    assert.equal(document.elements.get('#contextPanel').classList.values().has('is-defense-upgrade'), true);
    assert.ok(document.elements.get('#contextActions').children.find(button => button.textContent === '強化を確定'));

    ui.update();
    assert.equal(document.elements.get('#contextPanel').classList.values().has('is-defense-upgrade'), true);
    assert.match(flattenText(document.elements.get('#contextText')), /強化投石台/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('facility explanation replaces the metric view instead of stacking below it', async () => {
  const previousDocument = globalThis.document;
  const document = makeCombatDocument();
  globalThis.document = document;
  try {
    const { CombatUi } = await import('../src/ui/combat-ui.js');
    const state = makeState();
    const defense = gunDefense();
    state.combat.defenses.push(defense);
    const ui = new CombatUi({
      store: { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } },
      buildSystem: new BuildSystem(),
      civilizationSystem: new CivilizationSystem(),
      camera: { scale: 1 },
      renderer: { setFocus() {}, setBuildPlacement() {}, setFriendlyOrderPlanning() {}, render() {} },
      notifications: { show() {} }
    });
    ui.selectedObject = { kind: 'defense', id: defense.id };
    ui.renderContext();
    document.elements.get('#contextActions').children.find(button => button.textContent === '説明').click();

    const content = document.elements.get('#contextText');
    assert.equal(content.children.length, 1);
    assert.equal(content.children[0].className, 'defenseDetailCopy');
    assert.equal(document.elements.get('#contextPanel').classList.values().has('is-defense-details'), true);
    assert.ok(document.elements.get('#contextActions').children.find(button => button.textContent === '施設情報へ戻る'));
  } finally {
    globalThis.document = previousDocument;
  }
});

test('civilization panel explains the current defense tier ceiling and next unlock', async () => {
  const previousDocument = globalThis.document;
  const document = makeCivilizationDocument();
  globalThis.document = document;
  try {
    const { CivilizationUi } = await import('../src/ui/civilization-ui.js');
    const state = makeState();
    state.civilization.level = 2;
    const store = { select(selector) { return selector(state); }, mutate(mutator) { mutator(state); } };
    const ui = new CivilizationUi({ store, civilizationSystem: new CivilizationSystem(), notifications: { show() {} }, persist() {} });
    ui.render();
    const html = document.elements.get('#civilizationBody').innerHTML;
    assert.match(html, /防衛設備Tier/);
    assert.match(html, /強化上限 Tier 2/);
    assert.match(html, /石造投石塔/);
    assert.match(html, /文明Lv\.3で青銅投槍台/);
    assert.match(html, /石門/);
    assert.match(html, /派兵部隊/);
    assert.match(html, /攻城部隊/);
    assert.match(html, /文明Lv\.3で解禁/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('applying a tier uses the explicit durability table for every facility class', () => {
  for (const [type, line] of [['gun', 'single'], ['mortar', 'area'], ['slow', 'slow'], ['relay', 'repair']]) {
    const defense = { ...gunDefense(), type, line, tier: 0, defenseKey: `${line}0`, hp: DEFENSE_LINES[line][0].hp, maxHp: DEFENSE_LINES[line][0].hp };
    const definition = applyDefenseTier(defense, 4);
    assert.ok(definition);
    assert.equal(defense.maxHp, defenseTierMaxHp(defense, 4));
    assert.equal(defense.maxHp, DEFENSE_LINES[line][4].hp);
  }
});


test('upgraded attack statistics are used by live combat rather than only the UI', () => {
  const state = makeState();
  const base = { id: 'source', type: 'barracks', nodeId: 'home', level: 1, wavesSent: 0 };
  state.world.enemyBases = [base];
  const defense = gunDefense({ tier: 1, defenseKey: 'single1', hp: 180, maxHp: 180, nodeId: 'home' });
  state.combat.defenses.push(defense);
  const enemy = spawnEnemy(state, base, 'infantry', 0);
  enemy.nodeId = 'home';
  enemy.path = null;
  enemy.edgeId = null;
  new DefenseSystem().update(state, 0.1);
  assert.equal(enemy.hp, 43);
  assert.equal(defense.cooldown, 2);
});

test('defense panel uses a compact capped layout with fixed visible actions', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /v0\.30\.3 compact defense inspection states[\s\S]*?\.contextPanel\.is-defense-mode\s*\{[^}]*max-height:\s*min\(30vh, 250px\)/s);
  assert.match(css, /\.contextPanel\.is-defense-mode\s*#contextText\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.contextPanel\.is-defense-mode\s*#contextActions\s*\{[^}]*position:\s*static/s);
  assert.match(css, /\.contextPanel\.is-defense-summary\s*#contextText\s*\{[^}]*overflow:\s*hidden/s);
});
