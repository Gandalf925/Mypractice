import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, validateState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FIELD_BASE_BUILD_RANGE_METERS,
  FIELD_BASE_PLACEMENT_RANGE_METERS,
  FIELD_BASE_MAX_HP,
  fieldBaseMaxHpForCivilization,
  activeFieldBases,
  ensureFieldBaseState,
  fieldBaseLimitForCivilization,
  fieldBasePlacementCost
} from '../src/base/field-bases.js';
import { FieldBaseSystem, previewFieldBasePlacement } from '../src/base/field-base-system.js';
import { previewPlayerBasePlacement } from '../src/base/player-base-system.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { previewAssaultDeployment } from '../src/combat/friendly-force-system.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { evaluateProject } from '../src/civilization/progression-system.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'mid', x: 150, y: 0 },
      { id: 'field', x: 300, y: 0 },
      { id: 'field-near', x: 345, y: 0 },
      { id: 'field-far', x: 360, y: 0 },
      { id: 'enemy', x: 450, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'mid', length: 150, roadWidth: 5 },
      { id: 'b', a: 'mid', b: 'field', length: 150, roadWidth: 5 },
      { id: 'c', a: 'field', b: 'field-near', length: 45, roadWidth: 5 },
      { id: 'd', a: 'field-near', b: 'field-far', length: 15, roadWidth: 5 },
      { id: 'e', a: 'field-far', b: 'enemy', length: 90, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'camp', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1, wavesSent: 0 }];
  state.runtime.combatInitialized = true;
  state.runtime.worldTimeMs = 100_000;
  state.civilization.level = 1;
  state.player.locationAccuracy = 8;
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500, timber: 100, rope: 100, cutStone: 100, bronzeIngot: 100, wroughtIron: 100 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

function establishFieldBase(state, now = 100_000) {
  state.player.worldPosition = { x: 300, y: 0 };
  state.player.locationUpdatedAt = now;
  return new FieldBaseSystem().establishAtCurrentLocation(state, now).base;
}

test('civilization level provides a separate simple-base limit', () => {
  assert.equal(fieldBaseLimitForCivilization(0), 0);
  assert.equal(fieldBaseLimitForCivilization(1), 1);
  assert.equal(fieldBaseLimitForCivilization(4), 4);
});

test('simple-base placement requires civilization unlock, fresh GPS, road access and separation', () => {
  const state = fixture();
  const now = 100_000;
  state.civilization.level = 0;
  state.player.worldPosition = { x: 300, y: 0 };
  state.player.locationUpdatedAt = now;
  assert.match(previewFieldBasePlacement(state, now).reason, /Lv\.1/);
  state.civilization.level = 1;
  state.player.locationUpdatedAt = now - 301_000;
  assert.match(previewFieldBasePlacement(state, now).reason, /位置情報が古い/);
  state.player.locationUpdatedAt = now;
  state.player.worldPosition = { x: 0, y: 0 };
  assert.match(previewFieldBasePlacement(state, now).reason, /140m以上/);
  state.player.worldPosition = { x: 300, y: 0 };
  assert.equal(previewFieldBasePlacement(state, now).ok, true);
});




test('simple-base placement accepts a fresh stationary GPS fix and a road node within the wider placement radius', () => {
  const state = fixture();
  const now = 400_000;
  state.player.worldPosition = { x: 230, y: 0 };
  state.player.locationUpdatedAt = now - 4 * 60_000;
  const preview = previewFieldBasePlacement(state, now);
  assert.equal(FIELD_BASE_PLACEMENT_RANGE_METERS, 100);
  assert.equal(preview.ok, true);
  assert.equal(preview.node.id, 'field');
});
test('simple bases require and consume the processed-resource cost for their slot', () => {
  const state = fixture();
  const now = 100_000;
  state.player.worldPosition = { x: 300, y: 0 };
  state.player.locationUpdatedAt = now;
  const cost = fieldBasePlacementCost(state);
  assert.deepEqual(cost, { timber: 4, rope: 2 });
  Object.assign(state.inventory.resources, { timber: 0, rope: 0 });
  const blocked = previewFieldBasePlacement(state, now);
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.missing, cost);
  Object.assign(state.inventory.resources, cost);
  const result = new FieldBaseSystem().establishAtCurrentLocation(state, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cost, cost);
  assert.equal(state.inventory.resources.timber, 0);
  assert.equal(state.inventory.resources.rope, 0);
});

test('simple base uses civilization-scaled HP and its construction anchor grows to the level 1 bounded range', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  state.player.worldPosition = null;
  assert.equal(base.maxHp, fieldBaseMaxHpForCivilization(state.civilization.level));
  const anchors = new BuildSystem().getBuildAnchors(state);
  const anchor = anchors.find(value => value.id === `field:${base.id}`);
  assert.equal(anchor.range, 75);
  const sites = new BuildSystem().listBuildSites(state, 'gun');
  assert.equal(sites.some(site => site.nodeId === 'field-near' && site.anchorId === `field:${base.id}`), false);
  assert.equal(sites.some(site => site.nodeId === 'field-far' && site.anchorId === `field:${base.id}`), true);
});

test('current assault squad can deploy from an active simple base', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  const preview = previewAssaultDeployment(state, base.id, 'enemy-base');
  assert.equal(preview.ok, true);
  assert.equal(preview.origin.id, base.id);
});

test('nearby enemies can destroy a simple base and remove its construction and deployment roles', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  state.player.worldPosition = null;
  base.hp = 5;
  const enemySource = { id: 'source', nodeId: 'enemy', level: 1, wavesSent: 1 };
  const enemy = spawnEnemy(state, enemySource, 'infantry');
  const system = new EnemySystem();
  for (let index = 0; index < 5; index += 1) system.update(state, 200);
  assert.equal(base.status, 'DESTROYED');
  assert.equal(base.hp, 0);
  assert.equal(activeFieldBases(state).length, 0);
  assert.equal(new BuildSystem().getBuildAnchors(state).some(anchor => anchor.id === `field:${base.id}`), false);
  assert.equal(previewAssaultDeployment(state, base.id, 'enemy-base').ok, false);
  assert.equal(state.combat.enemies.some(value => value.id === enemy.id), false);
});

test('destroyed simple base keeps its slot and can only be rebuilt at the site', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  base.status = 'DESTROYED';
  base.hp = 0;
  const system = new FieldBaseSystem();
  state.player.worldPosition = { x: 0, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  assert.match(system.previewRebuild(state, base.id, 100_000).reason, /50m以内/);
  assert.match(system.previewCurrentLocation(state, 100_000).reason, /1個まで/);
  state.player.worldPosition = { x: 300, y: 0 };
  const rebuilt = system.rebuild(state, base.id, 100_000);
  assert.equal(rebuilt.ok, true);
  assert.equal(base.status, 'ESTABLISHED');
  assert.equal(base.hp, fieldBaseMaxHpForCivilization(state.civilization.level));
});

test('simple-base state survives save and restore without precise location metadata', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  base.location = { lat: 35.1234567, lon: 139.7654321 };
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'field-base-test');
  repository.save(state);
  assert.equal(storage.getItem('field-base-test').includes('35.1234567'), false);
  const restored = repository.load();
  ensureFieldBaseState(restored);
  assert.equal(restored.world.fieldBases.length, 1);
  assert.equal(restored.world.fieldBases[0].nodeId, 'field');
  assert.equal(validateState(restored).valid, true);
});


test('level-four civilization progress counts active simple bases instead of obsolete outposts', () => {
  const state = fixture();
  state.civilization.level = 3;
  state.world.fieldBases = [0, 1, 2].map(index => ({
    id: `field-${index}`, kind: 'FIELD', name: `簡易拠点 ${index + 1}`, status: 'ESTABLISHED',
    nodeId: 'field', x: 300 + index, y: 0, hp: 40, maxHp: 40, establishedAt: index + 1
  }));
  const check = evaluateProject(state).checks.find(item => item.key === 'activeFieldBases');
  assert.deepEqual({ current: check.current, required: check.required, complete: check.complete }, { current: 3, required: 3, complete: true });
});

test('a distant simple base does not pull attackers away from a much nearer city', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'enemy', x: 50, y: 0 },
      { id: 'field', x: 300, y: 0 }
    ],
    edges: [
      { id: 'near-city', a: 'enemy', b: 'home', length: 50, roadWidth: 5 },
      { id: 'far-field', a: 'enemy', b: 'field', length: 250, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [{ id: 'field-base', kind: 'FIELD', name: '簡易拠点 1', status: 'ESTABLISHED', nodeId: 'field', x: 300, y: 0, hp: 40, maxHp: 40, establishedAt: 2 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.runtime.combatInitialized = true;
  const enemy = spawnEnemy(state, { id: 'source', nodeId: 'enemy', level: 1, wavesSent: 1 }, 'infantry');
  new EnemySystem().update(state, 0.1);
  assert.equal(enemy.targetFieldBaseId, null);
  assert.equal(enemy.path.targetId, 'home');
});

test('standing at a level-one simple base uses its bounded 75m construction zone', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  state.player.worldPosition = { x: base.x, y: base.y };
  const anchors = new BuildSystem().getBuildAnchors(state);
  assert.ok(anchors.some(anchor => anchor.id === `field:${base.id}` && anchor.range === 75));
  assert.equal(anchors.some(anchor => anchor.id === 'player'), false);
  const sites = new BuildSystem().listBuildSites(state, 'gun');
  assert.ok(sites.some(site => site.nodeId === 'field-far' && site.anchorId === `field:${base.id}`));
});


test('a major base cannot be placed on top of an active simple base', () => {
  const state = fixture();
  establishFieldBase(state);
  state.civilization.level = 2;
  state.player.worldPosition = { x: 345, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  const preview = previewPlayerBasePlacement(state, 100_000);
  assert.equal(preview.ok, false);
  assert.match(preview.reason, /簡易拠点から220m以上/);
});

test('a destroyed simple-base ruin still blocks overlapping major-base placement', () => {
  const state = fixture();
  const base = establishFieldBase(state);
  base.status = 'DESTROYED';
  base.hp = 0;
  state.civilization.level = 2;
  state.player.worldPosition = { x: 345, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  const preview = previewPlayerBasePlacement(state, 100_000);
  assert.equal(preview.ok, false);
  assert.match(preview.reason, /簡易拠点から220m以上/);
});

test('an active simple base anchors regional simulation but a destroyed one does not', async () => {
  const { regionActivityAnchors } = await import('../src/combat/region-activity.js');
  const state = fixture();
  const base = establishFieldBase(state);
  state.player.worldPosition = null;
  assert.ok(regionActivityAnchors(state).some(anchor => anchor.x === base.x && anchor.y === base.y));
  base.status = 'DESTROYED';
  base.hp = 0;
  assert.equal(regionActivityAnchors(state).some(anchor => anchor.x === base.x && anchor.y === base.y), false);
});

test('an enemy chooses a nearby simple base when it is meaningfully closer than the city', () => {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'field', x: 250, y: 0 },
      { id: 'enemy', x: 300, y: 0 }
    ],
    edges: [
      { id: 'home-field', a: 'home', b: 'field', length: 250, roadWidth: 5 },
      { id: 'field-enemy', a: 'field', b: 'enemy', length: 50, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [{ id: 'field-base', kind: 'FIELD', name: '簡易拠点 1', status: 'ESTABLISHED', nodeId: 'field', x: 250, y: 0, hp: 40, maxHp: 40, establishedAt: 2 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.runtime.combatInitialized = true;
  const enemy = spawnEnemy(state, { id: 'source', nodeId: 'enemy', level: 1, wavesSent: 1 }, 'infantry');
  new EnemySystem().update(state, 0.1);
  assert.equal(enemy.targetFieldBaseId, 'field-base');
  assert.equal(enemy.path.targetId, 'field');
});
