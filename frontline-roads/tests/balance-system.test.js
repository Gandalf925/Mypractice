import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { DEFENSE_LINES } from '../src/civilization/data.js';
import { ENEMY_BASE_DEFINITIONS } from '../src/combat/definitions.js';
import { DefenseSystem } from '../src/combat/defense-system.js';
import { EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { buildCombatSpatialIndex } from '../src/combat/combat-spatial-index.js';
import {
  enemyBaseLevelForState,
  enemyLevelMultipliers,
  scaleEnemyDefinition,
  waveIntervalForBase
} from '../src/combat/enemy-scaling.js';
import { enemyGenerationMix, waveForBase } from '../src/combat/wave-system.js';

function pointState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [{ id: 'tower', x: 0, y: 0 }, { id: 'far', x: 200, y: 0 }],
    edges: [{ id: 'road', a: 'tower', b: 'far', length: 200 }]
  });
  state.world.city = { nodeId: 'tower', hp: 100, maxHp: 100 };
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'tower', x: 0, y: 0 };
  return state;
}

function fixedSpatial(entries) {
  return {
    positions: new Map(entries.map(entry => [entry.enemy.id, entry.position])),
    commanders: [],
    query(point, range) {
      const squared = range * range;
      return entries.filter(entry => {
        const dx = entry.position.x - point.x;
        const dy = entry.position.y - point.y;
        return dx * dx + dy * dy <= squared;
      });
    }
  };
}

function dummyEnemy(id) {
  return {
    id, type: 'infantry', level: 1, hp: 100, maxHp: 100, nodeId: 'far', path: null,
    pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 1,
    attackClock: 0, departDelay: 0, sourceBaseId: null, waveId: null,
    waveResolved: false, rewardGranted: false, reroutePending: false,
    routeBias: 1, targetDefenseId: null, notifiedDefenseIds: [], engagedSquadId: null
  };
}

function straightRoadScenario(types, { baseLevel = 2, slow = true } = {}) {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'city', x: 0, y: 0 },
      { id: 'mid', x: 100, y: 0 },
      { id: 'base', x: 200, y: 0 }
    ],
    edges: [
      { id: 'city-mid', a: 'city', b: 'mid', length: 100 },
      { id: 'mid-base', a: 'mid', b: 'base', length: 100 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0 };
  state.world.city = { nodeId: 'city', hp: 100, maxHp: 100 };
  const base = { id: 'source', type: 'barracks', nodeId: 'base', alive: true, level: baseLevel, wavesSent: 0 };
  state.world.enemyBases = [base];
  state.combat.defenses = [{
    id: 'area', kind: 'tower', type: 'mortar', line: 'area', tier: 0,
    nodeId: 'city', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0
  }];
  if (slow) {
    state.combat.defenses.push({
      id: 'slow', kind: 'tower', type: 'slow', line: 'slow', tier: 0,
      nodeId: 'city', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0
    });
  }
  for (const type of types) spawnEnemy(state, base, type, 0);
  return state;
}

function simulateDefense(state, seconds = 300, step = 0.5) {
  const defenses = new DefenseSystem();
  const enemies = new EnemySystem();
  for (let elapsed = 0; elapsed < seconds && state.combat.enemies.length > 0; elapsed += step) {
    const spatial = buildCombatSpatialIndex(state);
    defenses.update(state, step, spatial);
    enemies.update(state, step, spatial);
  }
  return state;
}

test('tier-zero area and slow defenses use the approved restrained values', () => {
  assert.deepEqual(DEFENSE_LINES.area[0], {
    key: 'area0', name: '岩落とし台', type: 'mortar', hp: 150,
    range: 90, damage: 18, cooldown: 16, blastRadius: 18,
    maxTargets: 3, splashMultiplier: 0.60,
    cost: { wood: 50, stone: 60, fiber: 18 }
  });
  assert.equal(DEFENSE_LINES.slow[0].range, 72);
  assert.equal(DEFENSE_LINES.slow[0].slow, 0.25);
  assert.equal(DEFENSE_LINES.slow[0].duration, 6);
  assert.equal(DEFENSE_LINES.slow[0].maxTargets, 3);
  assert.equal(DEFENSE_LINES.slow[0].cooldown, 8);
});

test('area defense applies full damage to one target, reduced splash and a hard target cap', () => {
  const state = pointState();
  const enemies = [dummyEnemy('a'), dummyEnemy('b'), dummyEnemy('c'), dummyEnemy('d')];
  state.combat.enemies = enemies;
  state.combat.defenses = [{
    id: 'area', kind: 'tower', type: 'mortar', line: 'area', tier: 0,
    nodeId: 'tower', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0
  }];
  const entries = enemies.map((enemy, index) => ({ enemy, position: { x: index * 4, y: 0 } }));
  new DefenseSystem().update(state, 0.1, fixedSpatial(entries));
  assert.equal(enemies[0].hp, 82);
  assert.equal(enemies[1].hp, 89.2);
  assert.equal(enemies[2].hp, 89.2);
  assert.equal(enemies[3].hp, 100);
});

test('slow defense affects only the nearest approved number of targets', () => {
  const state = pointState();
  const enemies = [dummyEnemy('a'), dummyEnemy('b'), dummyEnemy('c'), dummyEnemy('d')];
  state.combat.enemies = enemies;
  state.combat.defenses = [{
    id: 'slow', kind: 'tower', type: 'slow', line: 'slow', tier: 0,
    nodeId: 'tower', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0
  }];
  const entries = enemies.map((enemy, index) => ({ enemy, position: { x: 10 + index * 10, y: 0 } }));
  new DefenseSystem().update(state, 0.1, fixedSpatial(entries));
  for (const enemy of enemies.slice(0, 3)) {
    assert.equal(enemy.slowTimer, 6);
    assert.equal(enemy.slowMultiplier, 0.75);
    assert.equal(enemy.hp, 99);
  }
  assert.equal(enemies[3].slowTimer, 0);
  assert.equal(enemies[3].hp, 100);
});

test('enemy base growth follows age thresholds and civilization caps', () => {
  const state = createInitialState();
  state.runtime.worldTimeMs = 1_000_000;
  state.civilization.level = 0;
  assert.equal(enemyBaseLevelForState(state, 0), 1);
  assert.equal(enemyBaseLevelForState(state, 20 * 60), 2);
  assert.equal(enemyBaseLevelForState(state, 4 * 60 * 60), 2);
  state.civilization.level = 1;
  assert.equal(enemyBaseLevelForState(state, 60 * 60), 3);
  state.civilization.level = 4;
  assert.equal(enemyBaseLevelForState(state, 240 * 60), 5);
  state.civilization.level = 2;
  state.civilization.gracePeriodUntil = state.runtime.worldTimeMs + 1;
  assert.equal(enemyBaseLevelForState(state, 240 * 60), 3);
});

test('enemy level multipliers scale durability, attack and speed without runaway speed growth', () => {
  assert.deepEqual(enemyLevelMultipliers(5), { hp: 1.9, attack: 1.58, speed: 1.1 });
  const scaled = scaleEnemyDefinition({ hp: 50, speed: 1.2, cityDamage: 8, barrierDps: 2, facilityDps: 12 }, 3);
  assert.equal(scaled.hp, 68);
  assert.equal(scaled.speed, 1.248);
  assert.equal(scaled.cityDamage, 10);
  assert.equal(scaled.barrierDps, 2.44);
  assert.equal(scaled.facilityDps, 14.64);
});

test('spawned enemies retain the source base level and scaled HP for their lifetime', () => {
  const state = pointState();
  const base = { id: 'source', type: 'barracks', nodeId: 'far', alive: true, level: 3, wavesSent: 0 };
  state.world.enemyBases = [base];
  const enemy = spawnEnemy(state, base, 'infantry');
  assert.equal(enemy.level, 3);
  assert.equal(enemy.hp, 68);
  assert.equal(enemy.maxHp, 68);
  base.level = 5;
  assert.equal(enemy.level, 3);
  assert.equal(enemy.maxHp, 68);
});

test('enemy base levels add exactly one unit per level', () => {
  const state = createInitialState();
  state.civilization.level = 0;
  const counts = [];
  const waves = [];
  for (let level = 1; level <= 5; level += 1) {
    const wave = waveForBase(state, { id: 'base', type: 'barracks', level, wavesSent: 0 });
    waves.push(wave);
    counts.push(wave.length);
  }
  assert.deepEqual(counts, [3, 4, 5, 6, 7]);
  assert.ok(waves[2].includes('shield'), 'level-three barracks should introduce a specialist instead of only adding infantry');
});

test('new civilization enemy generations phase in at 15, 30, 45 and 60 minutes', () => {
  const state = createInitialState();
  state.civilization.level = 2;
  state.runtime.worldTimeMs = 10_000_000;
  const probabilityAt = minutes => {
    state.civilization.completedAt = state.runtime.worldTimeMs - minutes * 60 * 1000;
    return enemyGenerationMix(state).probability;
  };
  assert.equal(probabilityAt(14), 0);
  assert.equal(probabilityAt(15), 0.25);
  assert.equal(probabilityAt(30), 0.5);
  assert.equal(probabilityAt(45), 0.75);
  assert.equal(probabilityAt(60), 1);
});

test('higher enemy base levels increase pressure gradually rather than all at once', () => {
  const definition = ENEMY_BASE_DEFINITIONS.barracks;
  assert.equal(waveIntervalForBase(definition, 1, 100), 180);
  assert.equal(waveIntervalForBase(definition, 2, 100), 180);
  assert.equal(waveIntervalForBase(definition, 3, 100), 171);
  assert.equal(waveIntervalForBase(definition, 4, 100), 162);
  assert.equal(waveIntervalForBase(definition, 5, 100), 153);
  assert.equal(waveIntervalForBase(definition, 5, 30), 198.9);
});

test('a level-two mixed wave now reaches a city defended only by tier-zero area and slow facilities', () => {
  const state = straightRoadScenario(['infantry', 'infantry', 'infantry', 'shield'], { baseLevel: 2, slow: true });
  simulateDefense(state);
  assert.ok(state.world.city.hp < 100, `expected a breach, city HP was ${state.world.city.hp}`);
  assert.ok(state.world.city.hp >= 70, `tier-zero defenses were weakened too far, city HP was ${state.world.city.hp}`);
});

test('a heavier level-two formation creates meaningful pressure without instantly defeating the city', () => {
  const state = straightRoadScenario(['heavy', 'infantry', 'shield'], { baseLevel: 2, slow: true });
  simulateDefense(state);
  assert.ok(state.world.city.hp < 80, `expected significant pressure, city HP was ${state.world.city.hp}`);
  assert.ok(state.world.city.hp > 35, `expected the city to survive the reference wave, city HP was ${state.world.city.hp}`);
});

test('enemy base level increases emit one visible threat notification', async () => {
  const { WaveSystem } = await import('../src/combat/wave-system.js');
  const state = pointState();
  state.civilization.level = 0;
  state.world.enemyBases = [{
    id: 'source', type: 'barracks', nodeId: 'far', alive: true,
    hp: 100, maxHp: 100, level: 1, ageSeconds: 20 * 60 - 1,
    spawnClock: 0, wavesSent: 0, routeDistance: 200
  }];
  const messages = [];
  const levels = [];
  new WaveSystem({ emit(type, payload) {
    if (type === 'message') messages.push(payload.text);
    if (type === 'combat:enemy-base-level-up') levels.push(payload.level);
  } }).update(state, 2);
  assert.equal(state.world.enemyBases[0].level, 2);
  assert.deepEqual(levels, [2]);
  assert.match(messages.join('\n'), /Lv\.2/);
});

test('enemy individual level and scaled HP survive save and restore', async () => {
  const { SaveRepository } = await import('../src/persistence/save-repository.js');
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const state = pointState();
  const base = { id: 'source', type: 'barracks', nodeId: 'far', alive: true, level: 4, wavesSent: 0 };
  state.world.enemyBases = [base];
  const enemy = spawnEnemy(state, base, 'infantry');
  enemy.hp -= 7;
  const repository = new SaveRepository(new MemoryStorage());
  repository.save(state);
  const restored = repository.load();
  assert.equal(restored.combat.enemies[0].level, 4);
  assert.equal(restored.combat.enemies[0].maxHp, 80);
  assert.equal(restored.combat.enemies[0].hp, 73);
});

test('a new civilization generation keeps the previous generation during its opening grace window', () => {
  const state = createInitialState();
  state.civilization.level = 2;
  state.runtime.worldTimeMs = 10_000_000;
  state.civilization.completedAt = state.runtime.worldTimeMs;
  const wave = waveForBase(state, { id: 'transition-base', type: 'barracks', level: 2, wavesSent: 0 });
  assert.ok(wave.some(type => ['archer', 'ropeCutter'].includes(type)));
  assert.ok(!wave.some(type => ['miner', 'siegeBreaker', 'oreCarrier'].includes(type)));
});

test('enemy system applies the spawned enemy level to movement and city damage', () => {
  const state = pointState();
  const base = { id: 'source', type: 'barracks', nodeId: 'far', alive: true, level: 3, wavesSent: 0 };
  state.world.enemyBases = [base];
  const enemy = spawnEnemy(state, base, 'infantry');
  enemy.path = { nodeIds: ['far', 'tower'], edgeIds: ['road'], targetId: 'tower' };
  enemy.pathIndex = 0;
  enemy.edgeId = 'road';
  enemy.edgeProgress = 199.5;
  new EnemySystem().update(state, 1);
  assert.equal(state.world.city.hp, 90);
  assert.equal(state.combat.enemies.length, 0);
});
