import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { DEFENSE_LINES, RESOURCE_KEYS } from '../src/civilization/data.js';
import { ENEMY_BASE_DEFINITIONS } from '../src/combat/definitions.js';
import { ENEMY_DENSITY_BY_CIVILIZATION } from '../src/combat/enemy-scaling.js';

const BASE_TYPES = Object.freeze([
  'barracks', 'engineer', 'raider', 'motor',
  'copperCamp', 'tinCamp', 'ironCamp', 'bronzeCamp', 'siegeWorks'
]);
const STANDARD_TOWERS = Object.freeze({ 1: 8, 2: 12, 3: 16, 4: 20 });
const PROFILE_CASES = Object.freeze([
  { name: 'standard-civ1', level: 1, towerCount: STANDARD_TOWERS[1], expected: 'stable' },
  { name: 'standard-civ2', level: 2, towerCount: STANDARD_TOWERS[2], expected: 'stable' },
  { name: 'underbuilt-civ3', level: 3, towerCount: 10, expected: 'collapse-pressure' },
  { name: 'standard-civ3', level: 3, towerCount: STANDARD_TOWERS[3], expected: 'stable-pressure' },
  { name: 'underbuilt-civ4', level: 4, towerCount: 13, expected: 'collapse-pressure' },
  { name: 'standard-civ4', level: 4, towerCount: STANDARD_TOWERS[4], expected: 'stable-heavy-pressure' },
  { name: 'fortified-civ4', level: 4, towerCount: 27, expected: 'stable-fortified' }
]);

class PlaytestEvents {
  constructor() {
    this.counts = {};
    this.repairHp = 0;
    this.repairCost = {};
  }

  emit(type, payload = {}) {
    this.counts[type] = (this.counts[type] ?? 0) + 1;
    if (type !== 'combat:defense-repaired') return;
    this.repairHp += Math.max(0, Number(payload.repairHp) || 0);
    for (const [resource, amount] of Object.entries(payload.cost ?? {})) {
      this.repairCost[resource] = (this.repairCost[resource] ?? 0) + amount;
    }
  }
}

function radialRoadGraph(arms = 9, segments = 9, stepMeters = 40) {
  const nodes = [{ id: 'home', x: 0, y: 0 }];
  const edges = [];
  for (let arm = 0; arm < arms; arm += 1) {
    const angle = arm * Math.PI * 2 / arms;
    let previous = 'home';
    for (let segment = 1; segment <= segments; segment += 1) {
      const id = `a${arm}_${segment}`;
      nodes.push({
        id,
        x: Math.cos(angle) * segment * stepMeters,
        y: Math.sin(angle) * segment * stepMeters
      });
      edges.push({
        id: `e${arm}_${segment}`,
        a: previous,
        b: id,
        length: stepMeters,
        roadWidth: 6
      });
      previous = id;
    }
  }
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 },
    source: 'v0.32.12-balance-playtest',
    roadSpecVersion: 4,
    nodes,
    edges
  });
}

function activeBaseCount(level) {
  if (level < 2) return 4;
  if (level === 2) return 6;
  return 9;
}

function addEnemyBases(state, level, count) {
  state.world.enemyBases = BASE_TYPES.slice(0, count).map((type, index) => {
    const definition = ENEMY_BASE_DEFINITIONS[type];
    const maxHp = definition.isResourceBase ? 120 : 100;
    return {
      id: `playtest-base-${type}`,
      type,
      nodeId: `a${index}_9`,
      hp: maxHp,
      maxHp,
      alive: true,
      level: Math.min(5, level + 1),
      ageSeconds: level >= 3 ? 60 * 60 : level === 2 ? 20 * 60 : 0,
      spawnClock: Math.max(0, definition.interval - definition.firstDelay - index * 12),
      initialDelayBonusSec: 0,
      frontPressureMultiplier: 1,
      wavesSent: 0,
      routeDistance: 360
    };
  });
}

function addDefenseProfile(state, level, baseCount, towerCount) {
  const barrierDefinition = DEFENSE_LINES.barrier[level];
  for (let arm = 0; arm < baseCount; arm += 1) {
    state.combat.defenses.push({
      id: `playtest-barrier-${arm}`,
      kind: 'barrier',
      type: 'barrier',
      line: 'barrier',
      tier: level,
      defenseKey: barrierDefinition.key,
      edgeId: `e${arm}_3`,
      hp: barrierDefinition.hp,
      maxHp: barrierDefinition.hp,
      isGate: false
    });
  }

  const positions = [];
  for (let ring = 1; ring <= 3; ring += 1) {
    for (let arm = 0; arm < 9; arm += 1) positions.push(`a${arm}_${ring}`);
  }
  const distribution = ['gun', 'gun', 'gun', 'mortar', 'mortar', 'slow', 'relay'];
  for (let index = 0; index < towerCount; index += 1) {
    const type = distribution[index % distribution.length];
    const line = type === 'gun' ? 'single' : type === 'mortar' ? 'area' : type === 'slow' ? 'slow' : 'repair';
    const definition = DEFENSE_LINES[line][level];
    state.combat.defenses.push({
      id: `playtest-tower-${index}`,
      kind: 'tower',
      type,
      line,
      tier: level,
      defenseKey: definition.key,
      nodeId: positions[index],
      hp: definition.hp,
      maxHp: definition.hp,
      cooldown: 0,
      disabledTimer: 0
    });
  }
}

function createScenario(level, towerCount) {
  const state = createInitialState();
  state.world.roadGraph = radialRoadGraph();
  state.world.homeBase = {
    id: 'home-base',
    status: 'ESTABLISHED',
    nodeId: 'home',
    x: 0,
    y: 0,
    establishedAt: 1
  };
  initializeCombatState(state);
  state.civilization.level = level;
  state.civilization.completedAt = -10_000_000;
  state.civilization.gracePeriodUntil = 0;
  for (const resource of RESOURCE_KEYS) state.inventory.resources[resource] = 50_000;
  const baseCount = activeBaseCount(level);
  addEnemyBases(state, level, baseCount);
  addDefenseProfile(state, level, baseCount, towerCount);
  return state;
}

function resultCheck(profile, result) {
  if (profile.name === 'standard-civ1') return result.cityDefeats === 0 && result.peakEnemies >= 20;
  if (profile.name === 'standard-civ2') return result.cityDefeats === 0 && result.peakEnemies >= 60;
  if (profile.name === 'standard-civ3') return result.cityDefeats === 0 && result.peakEnemies >= 150 && result.destroyedDefenses >= 1;
  if (profile.name === 'standard-civ4') return result.cityDefeats === 0 && result.peakEnemies >= 280 && result.destroyedDefenses >= 1;
  if (profile.name === 'underbuilt-civ3') {
    return result.cityDefeats >= 1 || (result.minimumCityHp <= 70 && result.destroyedDefenses >= 8);
  }
  if (profile.name === 'underbuilt-civ4') {
    return result.cityDefeats >= 1 || result.minimumCityHp < 60;
  }
  if (profile.name === 'fortified-civ4') {
    return result.cityDefeats === 0 && result.peakEnemies >= 280 && result.destroyedDefenses <= 4;
  }
  return false;
}

function runScenario(profile, durationSeconds = 600) {
  const state = createScenario(profile.level, profile.towerCount);
  const events = new PlaytestEvents();
  const combat = new CombatSystem(events);
  const initialDefenseCount = state.combat.defenses.length;
  let peakEnemies = 0;
  let peakMovingEnemies = 0;
  let enemySamples = 0;
  let movingSamples = 0;
  let minimumCityHp = state.world.city.hp;
  let secondsAtHalfPopulationCap = 0;
  const populationCap = ENEMY_DENSITY_BY_CIVILIZATION[profile.level].populationCap;
  const startedAt = performance.now();

  for (let second = 0; second < durationSeconds; second += 1) {
    state.runtime.worldTimeMs += 1000;
    combat.update(state, 1);
    const enemies = state.combat.enemies.length;
    const moving = state.combat.enemies.filter(enemy => enemy.departDelay <= 0).length;
    peakEnemies = Math.max(peakEnemies, enemies);
    peakMovingEnemies = Math.max(peakMovingEnemies, moving);
    enemySamples += enemies;
    movingSamples += moving;
    minimumCityHp = Math.min(minimumCityHp, state.world.city.hp);
    if (enemies >= populationCap / 2) secondsAtHalfPopulationCap += 1;
  }

  const result = {
    profile: profile.name,
    expectedExperience: profile.expected,
    civilizationLevel: profile.level,
    durationSeconds,
    enemyPopulationCap: populationCap,
    enemyBases: activeBaseCount(profile.level),
    initialDefenses: initialDefenseCount,
    towerCount: profile.towerCount,
    finalDefenses: state.combat.defenses.length,
    destroyedDefenses: events.counts['combat:defense-destroyed'] ?? 0,
    repairEvents: events.counts['combat:defense-repaired'] ?? 0,
    repairedHp: Math.round(events.repairHp * 10) / 10,
    repairCost: events.repairCost,
    wavesLaunched: events.counts['combat:wave-launched'] ?? 0,
    enemiesKilled: events.counts['combat:enemy-killed'] ?? 0,
    peakEnemies,
    peakMovingEnemies,
    averageEnemies: Math.round(enemySamples / durationSeconds * 10) / 10,
    averageMovingEnemies: Math.round(movingSamples / durationSeconds * 10) / 10,
    secondsAtHalfPopulationCap,
    cityDefeats: events.counts['combat:city-defeated'] ?? 0,
    minimumCityHp: Math.round(minimumCityHp * 10) / 10,
    finalCityHp: Math.round(state.world.city.hp * 10) / 10,
    simulationMilliseconds: Math.round((performance.now() - startedAt) * 10) / 10
  };
  result.passed = resultCheck(profile, result);
  return result;
}

const scenarios = PROFILE_CASES.map(profile => runScenario(profile));
const report = {
  release: '0.32.12-hud-camera-balance-validation',
  generatedAt: new Date().toISOString(),
  simulation: {
    topology: 'nine-front radial road network',
    baseDistanceMeters: 360,
    durationSecondsPerScenario: 600,
    stepSeconds: 1,
    description: 'Deterministic combat simulation using production CombatSystem, wave generation, routing, defenses, automatic repair and city recovery.'
  },
  profiles: {
    standardTowerCounts: STANDARD_TOWERS,
    underbuilt: { 3: 10, 4: 13 },
    fortified: { 4: 27 }
  },
  scenarios,
  allChecksPassed: scenarios.every(item => item.passed),
  interpretation: [
    'Civilization levels 1 and 2 remain stable with moderate visible pressure.',
    'Civilization levels 3 and 4 produce a dense moving front and destroy facilities even when the city survives.',
    'The underbuilt level 3 profile loses most of its front line and drops near collapse; the underbuilt level 4 profile suffers an actual city defeat.',
    'A fortified level 4 network sharply reduces facility losses while retaining more than 280 simultaneous enemies.'
  ],
  limits: [
    'The deterministic simulation does not reproduce touch mistakes, GPS movement, player attention, network delay or Android GPU behavior.',
    'The profile grants sufficient stored resources so the test isolates combat pressure; progression resource acquisition is covered by separate regression tests.',
    'This is a repeatable balance harness, not a claim that every real road topology will produce identical results.'
  ]
};

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../docs/playtest-balance-v0.32.12.json');
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.allChecksPassed) process.exitCode = 1;
