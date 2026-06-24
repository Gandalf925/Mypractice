import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, validateState } from '../src/core/state-schema.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { attachGraphIndexes, buildRoadGraphFromSegments } from '../src/roads/road-graph.js';
import { CivilizationSystem, ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { EnemySystem } from '../src/combat/enemy-system.js';
import { parseOverpassSegments } from '../src/roads/road-parser.js';
import { segmentAngle, segmentMidpoint } from '../src/roads/geometry.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class DeniedStorage {
  getItem() { throw new Error('denied'); }
  setItem() { throw new Error('denied'); }
  removeItem() { throw new Error('denied'); }
}

function playableState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35.7869123, lon: 139.4693123 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0, lat: 35.7869123, lon: 139.4693123 },
      { id: 'a', x: 100, y: 0, lat: 35.7869123, lon: 139.4704123 },
      { id: 'base', x: 200, y: 0, lat: 35.7869123, lon: 139.4715123 }
    ],
    edges: [
      { id: 'ha', a: 'home', b: 'a', length: 100, roadWidth: 5 },
      { id: 'ab', a: 'a', b: 'base', length: 100, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, location: { lat: 35.7869123, lon: 139.4693123 } };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'source', type: 'barracks', nodeId: 'base', alive: true, wavesSent: 0 }];
  state.player.currentPosition = { lat: 35.7869123, lon: 139.4693123 };
  state.player.worldPosition = { x: 0, y: 0 };
  ensureCivilizationState(state, { initializeInventory: true });
  state.runtime.combatInitialized = true;
  return state;
}

function segment(id, a, b, extras = {}) {
  const value = { id, a, b, highway: 'residential', roadWidth: 5, lanes: 1, name: '', oneway: false, layer: 0, bridge: false, tunnel: false, ...extras };
  value.mid = segmentMidpoint(value);
  value.angle = segmentAngle(value);
  return value;
}

test('storage denial is detected without crashing construction', () => {
  const repository = new SaveRepository(new DeniedStorage(), 'denied');
  assert.equal(repository.isAvailable(), false);
  assert.match(repository.consumeWarning(), /保存領域/);
});

test('invalid shallow save is quarantined instead of bricking startup', () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'missing', x: 0, y: 0 };
  state.world.roadGraph = {};
  storage.setItem('game', JSON.stringify(state));
  const repository = new SaveRepository(storage, 'game');
  assert.equal(repository.load(), null);
  assert.equal(storage.getItem('game'), null);
  const backup = storage.getItem('game_corrupt_backup');
  assert.ok(backup);
  assert.equal(backup.includes('35.7869123'), false);
});

test('saved game removes exact position history and rounds map origin', () => {
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'game');
  repository.save(playableState());
  const raw = storage.getItem('game');
  const saved = JSON.parse(raw);
  assert.equal(saved.player.currentPosition, null);
  assert.equal(saved.world.homeBase.location, undefined);
  assert.equal(saved.world.roadGraph.center.lat, 35.7869);
  assert.equal(saved.world.roadGraph.center.lon, 139.4693);
  assert.equal(saved.world.roadGraph.nodes[0].lat, undefined);
  assert.equal(saved.world.roadGraph.edges[0].points, undefined);
  assert.equal(raw.includes('35.7869123'), false);
  assert.equal(raw.includes('139.4693123'), false);
});

test('state validation rejects malformed saved road graph', () => {
  const state = createInitialState();
  state.world.roadGraph = {};
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'x', x: 0, y: 0 };
  assert.equal(validateState(state).valid, false);
});

test('stone gate conversion cannot be used before civilization level 2', () => {
  const state = playableState();
  state.civilization.level = 1;
  Object.assign(state.inventory.resources, { cutStone: 100, timber: 100, rope: 100 });
  state.combat.defenses.push({ id: 'wall', kind: 'barrier', type: 'barrier', tier: 0, isGate: false, hp: 220, maxHp: 220 });
  const system = new CivilizationSystem();
  const result = system.progression.convertBarrierToGate(state, 'wall');
  assert.equal(result.ok, false);
  assert.equal(state.combat.defenses[0].isGate, false);
});

test('path invalidation waits for the current edge instead of teleporting backward', () => {
  const state = playableState();
  const enemy = {
    id: 'e', type: 'infantry', hp: 50, maxHp: 50, nodeId: 'base',
    path: { nodeIds: ['base', 'a', 'home'], edgeIds: ['ab', 'ha'], targetId: 'home' },
    pathIndex: 0, edgeId: 'ab', edgeProgress: 60, slowTimer: 0, slowMultiplier: 0.52,
    attackClock: 0, departDelay: 0, stunnedTowerIds: [], reroutePending: false
  };
  state.combat.enemies = [enemy];
  const system = new EnemySystem();
  system.invalidateAllPaths(state);
  system.update(state, 0.1);
  assert.ok(enemy.edgeProgress > 60);
  assert.equal(enemy.edgeId, 'ab');
});

test('grade-separated endpoints are not merged into one intersection', () => {
  const graph = buildRoadGraphFromSegments([
    segment('surface', { x: 0, y: 0 }, { x: 100, y: 0 }, { sourceNodeA: 1, sourceNodeB: 2 }),
    segment('bridge', { x: 100, y: 0 }, { x: 100, y: 100 }, { sourceNodeA: 3, sourceNodeB: 4, layer: 1, bridge: true })
  ], { lat: 35, lon: 139 });
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 2);
});

test('long OSM geometry is subdivided rather than discarded', () => {
  const elements = Array.from({ length: 18 }, (_, index) => ({
    type: 'way', id: 100 + index, nodes: [index * 2, index * 2 + 1],
    tags: { highway: 'residential', name: `road-${index}` },
    geometry: [
      { lat: 35 + index * 0.00001, lon: 139 },
      { lat: 35 + index * 0.00001, lon: 139.006 }
    ]
  }));
  const parsed = parseOverpassSegments({ elements }, { lat: 35, lon: 139.003 });
  assert.ok(parsed.length >= 36);
  assert.ok(parsed.every(item => Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y) <= 280.1));
});

test('complete reset clears current, legacy, and backup save keys', () => {
  const storage = new MemoryStorage();
  for (const key of ['game', 'legacy-a', 'game_legacy_backup', 'game_corrupt_backup', 'frontline_roads_primary_tab_v2']) storage.setItem(key, 'x');
  const repository = new SaveRepository(storage, 'game', ['legacy-a']);
  assert.equal(repository.clear(), true);
  for (const key of ['game', 'legacy-a', 'game_legacy_backup', 'game_corrupt_backup', 'frontline_roads_primary_tab_v2']) assert.equal(storage.getItem(key), null);
});

test('production source only enables dev fixture on local or explicit test origins', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /fixtureRequested && localFixtureAllowed/);
  assert.match(source, /localhost/);
  assert.match(source, /__FRONTLINE_TEST_FIXTURE__/);
});


test('road loading uses the injected fetch implementation without a script transport', async () => {
  const { readFile } = await import('node:fs/promises');
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../src/roads/overpass-client.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /fetchImpl: development\?\.fetchImpl \?\? globalThis\.fetch/);
  assert.doesNotMatch(client, /JSONP|jsonp|createElement\(['"]script/);
});
