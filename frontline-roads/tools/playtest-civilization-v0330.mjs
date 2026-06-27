import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { DEFENSE_LINES, RESOURCE_KEYS } from '../src/civilization/data.js';
import { ENEMY_BASE_DEFINITIONS } from '../src/combat/definitions.js';
import { ENEMY_DENSITY_BY_CIVILIZATION } from '../src/combat/enemy-scaling.js';
import { enemyBaseTypesForCivilization } from '../src/combat/wave-system.js';
import { friendlySquadRuntimeDefinition } from '../src/combat/friendly-force-definitions.js';
import { synchronizeOwnedBaseDurability } from '../src/base/player-bases.js';

const PROFILE_CASES = Object.freeze([
  { name: 'underbuilt-civ5', level: 5, towerCount: 18, barrierLayers: 1, squadCount: 6, baseAgeHours: 4, durationSeconds: 300, profile: 'underbuilt' },
  { name: 'standard-civ5', level: 5, towerCount: 28, barrierLayers: 2, squadCount: 14, baseAgeHours: 2, durationSeconds: 300, profile: 'standard' },
  { name: 'fortified-civ5', level: 5, towerCount: 38, barrierLayers: 3, squadCount: 20, baseAgeHours: 4, durationSeconds: 300, profile: 'fortified' },
  { name: 'underbuilt-civ6', level: 6, towerCount: 22, barrierLayers: 1, squadCount: 8, baseAgeHours: 4, durationSeconds: 300, profile: 'underbuilt' },
  { name: 'standard-civ6', level: 6, towerCount: 34, barrierLayers: 2, squadCount: 18, baseAgeHours: 2, durationSeconds: 300, profile: 'standard' },
  { name: 'fortified-civ6', level: 6, towerCount: 46, barrierLayers: 3, squadCount: 26, baseAgeHours: 4, durationSeconds: 300, profile: 'fortified' },
  { name: 'underbuilt-civ7', level: 7, towerCount: 27, barrierLayers: 1, squadCount: 10, baseAgeHours: 4, durationSeconds: 300, profile: 'underbuilt' },
  { name: 'standard-civ7', level: 7, towerCount: 42, barrierLayers: 2, squadCount: 22, baseAgeHours: 2, durationSeconds: 300, profile: 'standard' },
  { name: 'fortified-civ7', level: 7, towerCount: 56, barrierLayers: 3, squadCount: 32, baseAgeHours: 4, durationSeconds: 300, profile: 'fortified' }
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

function radialRoadGraph(arms = 10, segments = 9, stepMeters = 40) {
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
    source: 'v0.33.0-civilization-playtest',
    roadSpecVersion: 4,
    nodes,
    edges
  });
}

function addEnemyBases(state, level, baseAgeHours) {
  const types = enemyBaseTypesForCivilization(level);
  state.world.enemyBases = types.map((type, index) => {
    const definition = ENEMY_BASE_DEFINITIONS[type];
    const maxHp = definition.isResourceBase ? 160 : 140;
    return {
      id: `playtest-base-${type}`,
      type,
      nodeId: `a${index}_9`,
      hp: maxHp,
      maxHp,
      alive: true,
      level: Math.min(8, level + 1),
      ageSeconds: (Number(process.env.BASE_AGE_HOURS) || baseAgeHours) * 60 * 60,
      spawnClock: Math.max(0, definition.interval - definition.firstDelay - index * 8),
      initialDelayBonusSec: 0,
      frontPressureMultiplier: 1,
      wavesSent: 0,
      routeDistance: 360
    };
  });
}

function addDefenseProfile(state, level, towerCount, barrierLayers) {
  const baseCount = enemyBaseTypesForCivilization(level).length;
  const barrierDefinition = DEFENSE_LINES.barrier[level];
  const barrierSegments = [3, 5, 7].slice(0, barrierLayers);
  for (let layer = 0; layer < barrierSegments.length; layer += 1) {
    for (let arm = 0; arm < baseCount; arm += 1) {
      state.combat.defenses.push({
        id: `playtest-barrier-${layer}-${arm}`,
        kind: 'barrier',
        type: 'barrier',
        line: 'barrier',
        tier: level,
        defenseKey: barrierDefinition.key,
        edgeId: `e${arm}_${barrierSegments[layer]}`,
        hp: barrierDefinition.hp,
        maxHp: barrierDefinition.hp,
        isGate: false
      });
    }
  }

  const positions = [];
  for (let ring = 1; ring <= 5; ring += 1) {
    for (let arm = 0; arm < 10; arm += 1) positions.push(`a${arm}_${ring}`);
  }
  const distribution = ['gun', 'gun', 'gun', 'mortar', 'mortar', 'slow', 'relay', 'medical'];
  for (let index = 0; index < towerCount; index += 1) {
    const type = distribution[index % distribution.length];
    const line = type === 'gun'
      ? 'single'
      : type === 'mortar'
        ? 'area'
        : type === 'slow'
          ? 'slow'
          : type === 'medical'
            ? 'medical'
            : 'repair';
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

function addFriendlyProfile(state, level, squadCount) {
  const types = ['assault', 'skirmisher', 'heavy', 'expedition', 'engineer'];
  if (level >= 6) types.push('artillery');
  if (level >= 7) types.push('command');
  for (let index = 0; index < squadCount; index += 1) {
    let type = types[index % types.length];
    if (type === 'command' && state.combat.friendlySquads.some(item => item.type === 'command')) type = 'heavy';
    const definition = friendlySquadRuntimeDefinition(state, type);
    const arm = index % 10;
    const ring = index % 2 === 0 ? 2 : 4;
    const nodeId = `a${arm}_${ring}`;
    state.combat.friendlySquads.push({
      id: `playtest-squad-${index}`, type, hp: definition.hp, maxHp: definition.hp, members: definition.members,
      originBaseId: 'home-base', targetBaseId: null, missionTargetBaseId: null, targetEnemyId: null,
      missionType: 'ATTACK', nodeId, path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
      status: 'HALTED', order: 'HOLD', commandDestinationNodeId: nodeId, travelHistoryNodeIds: [nodeId],
      engagedEnemyId: null, combatCooldown: 0, departDelay: 0, formationId: null, formationTargetId: null,
      formationSpeed: null, formationSize: null, recoveryBaseId: null, recoveryStartedAt: null,
      reorganizationRemaining: 0, readyAt: null, deployedAt: 1
    });
  }
}

function createScenario(level, towerCount, barrierLayers, squadCount, baseAgeHours) {
  const state = createInitialState();
  state.world.roadGraph = radialRoadGraph();
  state.world.homeBase = {
    id: 'home-base',
    status: 'ESTABLISHED',
    nodeId: 'home',
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    establishedAt: 1
  };
  initializeCombatState(state);
  state.civilization.level = level;
  state.civilization.completedAt = -10_000_000;
  state.civilization.gracePeriodUntil = 0;
  synchronizeOwnedBaseDurability(state, level);
  for (const resource of RESOURCE_KEYS) state.inventory.resources[resource] = 100_000;
  addEnemyBases(state, level, baseAgeHours);
  addDefenseProfile(state, level, towerCount, barrierLayers);
  addFriendlyProfile(state, level, squadCount);
  return state;
}

function runScenario(profile, durationSeconds = 600) {
  const state = createScenario(profile.level, profile.towerCount, profile.barrierLayers, profile.squadCount, profile.baseAgeHours);
  const events = new PlaytestEvents();
  const combat = new CombatSystem(events);
  const initialDefenseCount = state.combat.defenses.length;
  let peakEnemies = 0;
  let peakMovingEnemies = 0;
  let enemySamples = 0;
  let movingSamples = 0;
  const initialCityHp = state.world.city.hp;
  let minimumCityHp = initialCityHp;
  let secondsAtHalfPopulationCap = 0;
  const populationCap = ENEMY_DENSITY_BY_CIVILIZATION[profile.level].populationCap;
  const startedAt = performance.now();
  let elapsedSeconds = 0;

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
    elapsedSeconds = second + 1;
    if (profile.profile === 'underbuilt' && (events.counts['combat:city-defeated'] ?? 0) >= 1) break;
  }

  return {
    profile: profile.name,
    defenseProfile: profile.profile,
    civilizationLevel: profile.level,
    requestedDurationSeconds: durationSeconds,
    durationSeconds: elapsedSeconds,
    enemyPopulationCap: populationCap,
    initialCityHp,
    enemyBases: enemyBaseTypesForCivilization(profile.level).length,
    initialDefenses: initialDefenseCount,
    towerCount: profile.towerCount,
    initialFriendlySquads: profile.squadCount,
    finalFriendlySquads: state.combat.friendlySquads.length,
    destroyedFriendlySquads: events.counts['friendly:squad-destroyed'] ?? 0,
    finalDefenses: state.combat.defenses.length,
    defenseSurvivalRatio: Math.round(state.combat.defenses.length / Math.max(1, initialDefenseCount) * 1000) / 1000,
    destroyedDefenses: events.counts['combat:defense-destroyed'] ?? 0,
    repairEvents: events.counts['combat:defense-repaired'] ?? 0,
    repairedHp: Math.round(events.repairHp * 10) / 10,
    repairCost: events.repairCost,
    wavesLaunched: events.counts['combat:wave-launched'] ?? 0,
    enemiesKilled: events.counts['combat:enemy-killed'] ?? 0,
    peakEnemies,
    peakMovingEnemies,
    averageEnemies: Math.round(enemySamples / Math.max(1, elapsedSeconds) * 10) / 10,
    averageMovingEnemies: Math.round(movingSamples / Math.max(1, elapsedSeconds) * 10) / 10,
    secondsAtHalfPopulationCap,
    cityDefeats: events.counts['combat:city-defeated'] ?? 0,
    minimumCityHp: Math.round(minimumCityHp * 10) / 10,
    finalCityHp: Math.round(state.world.city.hp * 10) / 10,
    simulationMilliseconds: Math.round((performance.now() - startedAt) * 10) / 10
  };
}

function resultCheck(result) {
  if (result.defenseProfile === 'underbuilt') {
    return result.cityDefeats >= 1
      || (result.minimumCityHp <= result.initialCityHp * 0.4 && result.destroyedDefenses >= 8)
      || (result.peakMovingEnemies >= result.enemyPopulationCap * 0.58
        && result.averageMovingEnemies >= result.enemyPopulationCap * 0.35
        && result.destroyedFriendlySquads >= 3);
  }
  if (result.defenseProfile === 'standard') {
    const minimumMoving = result.civilizationLevel === 5 ? 190 : result.civilizationLevel === 6 ? 230 : 300;
    return result.cityDefeats === 0
      && result.peakMovingEnemies >= minimumMoving
      && (result.destroyedDefenses >= 1 || result.repairEvents >= 30 || result.repairedHp >= 900);
  }
  if (result.defenseProfile === 'fortified') {
    const minimumMoving = result.civilizationLevel === 5 ? 190 : result.civilizationLevel === 6 ? 230 : 270;
    return result.cityDefeats === 0
      && result.peakMovingEnemies >= minimumMoving
      && result.destroyedDefenses <= (result.civilizationLevel === 5 ? 20 : result.civilizationLevel === 6 ? 14 : 18);
  }
  return false;
}

const durationOverride = Number(process.env.DURATION_SECONDS);
const towerOverride = Number(process.env.TOWER_COUNT);

function effectiveProfile(profile) {
  return Number.isFinite(towerOverride) && towerOverride > 0
    ? { ...profile, towerCount: Math.floor(towerOverride) }
    : profile;
}

function requestedDuration(profile) {
  return Number.isFinite(durationOverride) && durationOverride > 0
    ? Math.max(60, Math.floor(durationOverride))
    : profile.durationSeconds;
}

if (process.env.PROFILE) {
  const profile = PROFILE_CASES.find(item => item.name === process.env.PROFILE);
  if (!profile) throw new Error(`Unknown playtest profile: ${process.env.PROFILE}`);
  const selected = effectiveProfile(profile);
  const result = runScenario(selected, requestedDuration(selected));
  result.passed = resultCheck(result);
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} else {
  const scriptPath = fileURLToPath(import.meta.url);
  const scenarios = PROFILE_CASES.map(profile => {
    console.error(`[playtest] ${profile.name}`);
    const child = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, PROFILE: profile.name, DURATION_SECONDS: '', TOWER_COUNT: '' },
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 16 * 1024 * 1024
    });
    if (child.error) throw child.error;
    const output = child.stdout.trim();
    if (!output) throw new Error(`Playtest profile ${profile.name} produced no result. ${child.stderr.trim()}`);
    return JSON.parse(output.split('\n').at(-1));
  });
  const fortificationChecks = [5, 6, 7].map(level => {
    const standard = scenarios.find(item => item.profile === `standard-civ${level}`);
    const fortified = scenarios.find(item => item.profile === `fortified-civ${level}`);
    return {
      level,
      standard: {
        finalDefenses: standard.finalDefenses,
        defenseSurvivalRatio: standard.defenseSurvivalRatio,
        enemiesKilled: standard.enemiesKilled,
        averageMovingEnemies: standard.averageMovingEnemies
      },
      fortified: {
        finalDefenses: fortified.finalDefenses,
        defenseSurvivalRatio: fortified.defenseSurvivalRatio,
        enemiesKilled: fortified.enemiesKilled,
        averageMovingEnemies: fortified.averageMovingEnemies
      },
      passed: fortified.cityDefeats === 0
        && fortified.finalDefenses > standard.finalDefenses
        && fortified.enemiesKilled >= standard.enemiesKilled
        && fortified.averageMovingEnemies < standard.averageMovingEnemies
    };
  });
  const report = {
    release: '0.33.0-civilization-road-federation',
    generatedAt: new Date().toISOString(),
    simulation: {
      topology: 'ten-front radial road network',
      baseDistanceMeters: 360,
      durationSecondsPerScenario: Object.fromEntries(PROFILE_CASES.map(profile => [profile.name, profile.durationSeconds])),
      stepSeconds: 1,
      description: 'Deterministic late-game simulation using the production CombatSystem, real wave generation, routing, defense targeting, automatic repair and city recovery.'
    },
    scenarios,
    fortificationChecks,
    allChecksPassed: scenarios.every(item => item.passed) && fortificationChecks.every(item => item.passed),
    interpretation: [
      'Civilization levels 5 through 7 sustain progressively denser moving fronts rather than relying only on enemy health inflation.',
      'Underbuilt profiles must reach an actual defeat or a measurable overrun state within five minutes.',
      'Standard profiles must survive while still losing facilities and requiring repair decisions.',
      'A fortified network must retain more surviving facilities, kill at least as many enemies and reduce average moving pressure. Absolute destroyed-facility count can rise because the larger network exposes more targets.'
    ],
    limits: [
      'The deterministic simulation does not reproduce touch mistakes, GPS movement, player attention, network delay or Android GPU behavior.',
      'The profile grants sufficient stored resources so the test isolates combat pressure; progression economics are covered separately.',
      'Road topology materially changes difficulty, so these thresholds describe the fixed test network rather than every real location.'
    ]
  };

  const here = dirname(scriptPath);
  const outputPath = resolve(here, '../docs/playtest-civilization-v0.33.0.json');
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.allChecksPassed) process.exitCode = 1;
}
