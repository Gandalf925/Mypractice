import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ENEMY_DEFINITIONS, ENEMY_GENERATIONS } from '../src/combat/definitions.js';
import { enemyBehaviorForDefinition } from '../src/combat/enemy-personalities.js';
import { findCombatPath } from '../src/combat/routing-system.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { buildCombatSpatialIndex } from '../src/combat/combat-spatial-index.js';
import { waveDoctrineForBase, waveForBase } from '../src/combat/wave-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';


class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

function graphState(nodes, edges) {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1, nodes, edges
  });
  state.world.city = { nodeId: nodes.at(-1).id, hp: 100, maxHp: 100 };
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: nodes.at(-1).id, x: nodes.at(-1).x, y: nodes.at(-1).y };
  state.world.enemyBases = [];
  state.world.fieldBases = [];
  state.combat.defenses = [];
  state.combat.enemies = [];
  state.combat.friendlySquads = [];
  return state;
}

function sourceBase(nodeId = 'start', overrides = {}) {
  return { id: 'enemy-base', type: 'barracks', nodeId, level: 1, wavesSent: 0, ...overrides };
}

test('civilization generations contain expanded valid enemy variants with explicit personalities', () => {
  assert.ok(ENEMY_GENERATIONS[1].length >= 4);
  assert.ok(ENEMY_GENERATIONS[2].length >= 5);
  assert.ok(ENEMY_GENERATIONS[3].length >= 5);
  assert.ok(ENEMY_GENERATIONS[4].length >= 6);
  for (const [generation, types] of Object.entries(ENEMY_GENERATIONS)) {
    for (const type of types) {
      const definition = ENEMY_DEFINITIONS[type];
      assert.ok(definition, `generation ${generation} references ${type}`);
      const behavior = enemyBehaviorForDefinition(definition);
      assert.ok(behavior.personalityLabel);
      assert.ok(behavior.description);
    }
  }
  for (const type of ['pathfinder', 'marauder', 'sapper', 'pillager', 'flankRider', 'warDrummer', 'squadHunter', 'ironSaboteur', 'bodyguard']) {
    assert.ok(ENEMY_DEFINITIONS[type], `${type} must exist`);
  }
});

test('flanking enemies choose a bounded longer side road while direct infantry uses the shortest road', () => {
  const state = graphState([
    { id: 'start', x: -100, y: 0 },
    { id: 'middle', x: 0, y: 0 },
    { id: 'outer-a', x: -60, y: 90 },
    { id: 'outer-b', x: 60, y: 90 },
    { id: 'city', x: 100, y: 0 }
  ], [
    { id: 'direct-a', a: 'start', b: 'middle', length: 100, roadWidth: 5 },
    { id: 'direct-b', a: 'middle', b: 'city', length: 100, roadWidth: 5 },
    { id: 'outer-a', a: 'start', b: 'outer-a', length: 98.5, roadWidth: 5 },
    { id: 'outer-mid', a: 'outer-a', b: 'outer-b', length: 120, roadWidth: 5 },
    { id: 'outer-b', a: 'outer-b', b: 'city', length: 98.5, roadWidth: 5 }
  ]);

  const direct = findCombatPath(state, 'start', 'city', 'infantry');
  const flank = findCombatPath(state, 'start', 'city', 'pathfinder');

  assert.deepEqual(direct.edgeIds, ['direct-a', 'direct-b']);
  assert.equal(direct.routeMode, 'DIRECT');
  assert.deepEqual(flank.edgeIds, ['outer-a', 'outer-mid', 'outer-b']);
  assert.equal(flank.routeMode, 'FLANK');
  assert.ok(flank.detourPercent >= 40 && flank.detourPercent <= 70);
  assert.ok(flank.distanceMeters <= direct.distanceMeters * ENEMY_DEFINITIONS.pathfinder.maxDetourRatio);
});

test('marauder personality prioritizes a field base over an equally reachable city', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'field', x: 80, y: 0 },
    { id: 'city', x: 0, y: 80 }
  ], [
    { id: 'to-field', a: 'start', b: 'field', length: 80, roadWidth: 5 },
    { id: 'to-city', a: 'start', b: 'city', length: 80, roadWidth: 5 }
  ]);
  state.world.fieldBases = [{ id: 'field-1', name: '北部簡易拠点', status: 'ESTABLISHED', nodeId: 'field', x: 80, y: 0, hp: 40, maxHp: 40 }];
  const enemy = spawnEnemy(state, sourceBase(), 'marauder');

  new EnemySystem().update(state, 0.1);

  assert.equal(enemy.targetFieldBaseId, 'field-1');
  assert.equal(enemy.path.targetId, 'field');
});

test('squad hunter plans toward an active friendly squad and damages it after contact', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'squad-node', x: 30, y: 0 },
    { id: 'city', x: 100, y: 0 }
  ], [
    { id: 'hunt-road', a: 'start', b: 'squad-node', length: 30, roadWidth: 5 },
    { id: 'city-road', a: 'squad-node', b: 'city', length: 70, roadWidth: 5 }
  ]);
  const squad = {
    id: 'friendly-1', type: 'assault', status: 'OUTBOUND', order: 'ADVANCE', hp: 100, maxHp: 100,
    nodeId: 'squad-node', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0, engagedEnemyId: null
  };
  state.combat.friendlySquads.push(squad);
  const enemy = spawnEnemy(state, sourceBase(), 'squadHunter');
  const system = new EnemySystem();

  system.update(state, 0.1);
  assert.equal(enemy.targetSquadId, squad.id);
  assert.equal(enemy.path.targetId, 'squad-node');

  system.update(state, 25);
  const before = squad.hp;
  system.update(state, 1);
  assert.equal(enemy.engagedSquadId, squad.id);
  assert.ok(squad.hp < before);
});

test('war drummer speed aura accelerates nearby allies without accelerating itself', () => {
  const make = withDrummer => {
    const state = graphState([
      { id: 'start', x: 0, y: 0 },
      { id: 'city', x: 100, y: 0 }
    ], [{ id: 'road', a: 'start', b: 'city', length: 100, roadWidth: 5 }]);
    const infantry = spawnEnemy(state, sourceBase(), 'infantry');
    const drummer = withDrummer ? spawnEnemy(state, sourceBase(), 'warDrummer') : null;
    return { state, infantry, drummer };
  };

  const baseline = make(false);
  const supported = make(true);
  const system = new EnemySystem();
  system.update(baseline.state, 10, buildCombatSpatialIndex(baseline.state));
  system.update(supported.state, 10, buildCombatSpatialIndex(supported.state));

  assert.ok(supported.infantry.edgeProgress > baseline.infantry.edgeProgress * 1.1);
  assert.ok(supported.drummer.edgeProgress < supported.infantry.edgeProgress);
});

test('civilization level four rotates doctrines and introduces the new generation across repeated waves', () => {
  const state = createInitialState();
  state.civilization.level = 4;
  state.civilization.completedAt = 1_000_000;
  state.runtime.worldTimeMs = state.civilization.completedAt + 2 * 60 * 60 * 1000;
  const base = { id: 'doctrine-base', type: 'barracks', level: 5, wavesSent: 0 };
  const doctrines = new Set();
  const seen = new Set();
  for (let index = 0; index < 48; index += 1) {
    base.wavesSent = index;
    const doctrine = waveDoctrineForBase(state, base);
    doctrines.add(doctrine.key);
    for (const type of waveForBase(state, base, doctrine.key)) seen.add(type);
  }

  assert.ok(doctrines.has('flank'));
  assert.ok(doctrines.has('raid'));
  assert.ok(doctrines.has('hunt'));
  assert.ok([...ENEMY_GENERATIONS[4]].some(type => seen.has(type)));
  assert.ok(seen.has('squadHunter'));
  assert.ok(seen.has('ironSaboteur') || seen.has('bodyguard'));
});


test('personality route and doctrine metadata survive the unchanged save schema', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'city', x: 100, y: 0 }
  ], [{ id: 'road', a: 'start', b: 'city', length: 100, roadWidth: 5 }]);
  const enemy = spawnEnemy(state, sourceBase(), 'pathfinder', 0, 'wave-1', 'flank');
  enemy.path = findCombatPath(state, 'start', 'city', 'pathfinder');
  enemy.edgeId = enemy.path.edgeIds[0];
  enemy.targetSquadId = 'legacy-optional-target';

  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'personality-save');
  repository.save(state);
  const restored = repository.load();
  const restoredEnemy = restored.combat.enemies[0];

  assert.equal(restored.schemaVersion, state.schemaVersion);
  assert.equal(restoredEnemy.doctrineKey, 'flank');
  assert.equal(restoredEnemy.targetSquadId, 'legacy-optional-target');
  assert.equal(restoredEnemy.path.routeMode, enemy.path.routeMode);
  assert.equal(restoredEnemy.path.personalityKey, 'flanker');
});
