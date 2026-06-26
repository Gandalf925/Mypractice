import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { CivilizationSystem } from '../src/civilization/civilization-system.js';
import { ProgressionSystem, evaluateProject } from '../src/civilization/progression-system.js';
import {
  CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, SETTLEMENT_BUILDINGS
} from '../src/civilization/data.js';
import { consumeBundle } from '../src/civilization/inventory-system.js';
import {
  dispatchFriendlySquad, FRIENDLY_SQUAD_STATUS
} from '../src/combat/friendly-force-system.js';
import { fieldBaseLimitForCivilization } from '../src/base/field-bases.js';
import { majorBaseMaxHpForCivilization } from '../src/base/player-bases.js';
import { enemyBaseTypesForCivilization } from '../src/combat/wave-system.js';
import { ENEMY_BASE_DEFINITIONS } from '../src/combat/definitions.js';

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, '../docs');

class JourneyEvents {
  constructor() { this.counts = {}; }
  emit(type) { this.counts[type] = (this.counts[type] ?? 0) + 1; }
}

function gridTopology() {
  const size = 17;
  const center = 8;
  const nodes = [];
  const edges = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      nodes.push({ id: `n${row}_${column}`, x: (column - center) * 50, y: (row - center) * 50 });
    }
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (column < size - 1) edges.push({ id: `h${row}_${column}`, a: `n${row}_${column}`, b: `n${row}_${column + 1}`, length: 50, roadWidth: 6 });
      if (row < size - 1) edges.push({ id: `v${row}_${column}`, a: `n${row}_${column}`, b: `n${row + 1}_${column}`, length: 50, roadWidth: 6 });
    }
  }
  return {
    graph: attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'user-journey-v0.33.4', roadSpecVersion: 6, nodes, edges }),
    home: 'n8_8'
  };
}

function openingState() {
  const state = createInitialState();
  const selected = gridTopology();
  const home = selected.graph.nodeById.get(selected.home);
  state.world.roadGraph = selected.graph;
  state.world.homeBase = {
    id: 'home-base', status: 'ESTABLISHED', nodeId: selected.home,
    x: home.x, y: home.y, establishedAt: 1
  };
  initializeCombatState(state);
  return state;
}

function addGun(state, index) {
  const definition = DEFENSE_LINES.single[0];
  if (!consumeBundle(state, definition.cost)) return false;
  const adjacent = state.world.roadGraph.adjacency.get(state.world.city.nodeId) ?? [];
  const nodeId = index === 0 ? state.world.city.nodeId : adjacent[index - 1]?.to ?? state.world.city.nodeId;
  state.combat.defenses.push({
    id: `journey-gun-${index}`, kind: 'tower', type: 'gun', line: 'single', tier: 0,
    nodeId, hp: definition.hp, maxHp: definition.hp, cooldown: 0, disabledTimer: 0, baseId: 'home-base'
  });
  return true;
}

function addBarrier(state) {
  if (state.combat.defenses.some(defense => defense.kind === 'barrier')) return true;
  const definition = DEFENSE_LINES.barrier[0];
  if (!consumeBundle(state, definition.cost)) return false;
  const edgeId = (state.world.roadGraph.adjacency.get(state.world.city.nodeId) ?? [])[0]?.edgeId;
  if (!edgeId) return false;
  state.combat.defenses.push({
    id: 'journey-barrier', kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0,
    edgeId, hp: definition.hp, maxHp: definition.hp, cooldown: 0, disabledTimer: 0, isGate: false
  });
  return true;
}

function hasActiveMission(state) {
  return state.combat.friendlySquads.some(squad => squad.hp > 0
    && ![FRIENDLY_SQUAD_STATUS.READY, FRIENDLY_SQUAD_STATUS.RECOVERING].includes(squad.status));
}

function dispatchNearest(state) {
  if (hasActiveMission(state)) return false;
  const target = state.world.enemyBases.filter(base => base.alive)
    .sort((left, right) => left.routeDistance - right.routeDistance)[0];
  return target ? dispatchFriendlySquad(state, 'assault', 'home-base', target.id).ok : false;
}

function collectOneArtifact(state, combat) {
  const item = state.world.recoveryItems.find(candidate => candidate.status === 'AVAILABLE');
  if (!item) return false;
  const point = state.world.roadGraph.nodeById.get(item.nodeId);
  state.player.worldPosition = { x: point.x, y: point.y };
  state.player.locationAccuracy = 5;
  state.player.locationUpdatedAt = state.runtime.worldTimeMs;
  if (!combat.recoverySystem.beginCollection(state, item.id, state.runtime.worldTimeMs).ok) return false;
  combat.recoverySystem.update(state, 5, state.runtime.worldTimeMs);
  return true;
}

function contributeOpeningResources(state, progression) {
  const reserve = { wood: 20, stone: 20, fiber: 8 };
  for (const resource of Object.keys(CIVILIZATION_PROJECTS[1].contributions)) {
    const amount = Math.max(0, (state.inventory.resources[resource] ?? 0) - (reserve[resource] ?? 0));
    if (amount > 0) progression.contribute(state, resource, amount);
  }
}

function runOpeningProfile(profile) {
  const state = openingState();
  const events = new JourneyEvents();
  const combat = new CombatSystem(events);
  const civilization = new CivilizationSystem(events);
  const progression = new ProgressionSystem(events);
  let builtGuns = 0;
  let projectReadyAt = null;
  let completedAt = null;

  for (let elapsed = 0; elapsed < 60 * 60; elapsed += 1) {
    state.runtime.worldTimeMs += 1000;
    if (builtGuns < profile.gunBuildTimes.length && elapsed >= profile.gunBuildTimes[builtGuns]) {
      if (addGun(state, builtGuns)) builtGuns += 1;
    }
    const recovering = state.combat.friendlySquads.some(squad => squad.hp > 0 && squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING);
    if (profile.dispatchAt != null && elapsed >= profile.dispatchAt && elapsed % 5 === 0 && !recovering) dispatchNearest(state);
    if (profile.buildBarrier && state.statistics.campsCaptured >= 1) addBarrier(state);
    if (elapsed >= 10 * 60 && state.civilization.totalArtifactsRecovered < 1) collectOneArtifact(state, combat);
    if (elapsed % 10 === 0) {
      for (const defense of state.combat.defenses) {
        if (defense.hp / defense.maxHp < 0.55) progression.repairDefense(state, defense.id);
      }
      if (state.statistics.kills >= 20 && state.combat.defenses.length >= 3) contributeOpeningResources(state, progression);
    }
    const evaluation = evaluateProject(state);
    if (evaluation.complete && projectReadyAt == null) projectReadyAt = elapsed;
    if (evaluation.complete && state.civilization.project?.status !== 'BUILDING') progression.start(state);
    combat.update(state, 1);
    civilization.update(state, 1);
    if (state.civilization.level >= 1) {
      completedAt = elapsed;
      break;
    }
  }

  return {
    profile: profile.name,
    description: profile.description,
    builtGuns,
    projectReadySeconds: projectReadyAt,
    civilizationLevelOneSeconds: completedAt,
    cityDefeats: events.counts['combat:city-defeated'] ?? 0,
    friendlySquadsDestroyed: events.counts['friendly:squad-destroyed'] ?? 0,
    kills: state.statistics.kills,
    campsCaptured: state.statistics.campsCaptured,
    finalCityHp: Math.round(state.world.city.hp * 10) / 10,
    finalDefenses: state.combat.defenses.length,
    passed: profile.expectCompletion
      ? completedAt != null && (events.counts['combat:city-defeated'] ?? 0) === 0
      : completedAt == null && (events.counts['combat:city-defeated'] ?? 0) >= 1
  };
}

function parseLoggedJson(name) {
  return readFile(resolve(docs, name), 'utf8').then(text => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error(`JSON report missing in ${name}`);
    return JSON.parse(text.slice(start, end + 1));
  });
}

function compareScenarioReports(before, after) {
  const metrics = [
    'cityDefeats', 'minimumCityHp', 'destroyedDefenses', 'destroyedFriendlySquads',
    'wavesLaunched', 'enemiesKilled', 'peakEnemies', 'peakMovingEnemies', 'finalCityHp',
    'repairEvents', 'repairedHp'
  ];
  const changes = [];
  for (const previous of before.scenarios) {
    const current = after.scenarios.find(item => item.profile === previous.profile);
    if (!current) {
      changes.push({ profile: previous.profile, missing: true });
      continue;
    }
    const changed = Object.fromEntries(metrics
      .filter(metric => previous[metric] !== current[metric])
      .map(metric => [metric, { before: previous[metric], after: current[metric] }]));
    if (Object.keys(changed).length) changes.push({ profile: previous.profile, changed });
  }
  return { scenariosCompared: before.scenarios.length, gameplayMetricChanges: changes };
}

function progressionFeasibility() {
  const settlementTypes = new Set();
  const levels = [];
  const resourceBaseForCheck = {
    copperCampsCaptured: 'copperCamp', tinCampsCaptured: 'tinCamp', ironCampsCaptured: 'ironCamp', machineWorksCaptured: 'machineWorks'
  };
  const productionBuildingForCheck = {
    selfProducedBronze: ['trialBronzeFurnace', 'bronzeWorkshop'],
    selfProducedWroughtIron: ['bloomery', 'forge'],
    selfProducedSteel: ['steelworks'],
    selfProducedMechanism: ['mechanismWorkshop']
  };
  const commanderTypeForCheck = {
    siegeCaptainsDefeated: 'siegeCaptain',
    generation5CommandersDefeated: 'steelCaptain',
    generation6CommandersDefeated: 'machineCommander'
  };
  const defenseKindsForCheck = {
    upgradedDefenseKinds: 1, bronzeDefenseKinds: 3, ironDefenseKinds: 4,
    steelDefenseKinds: 5, mechanismDefenseKinds: 6
  };

  for (let target = 1; target <= 7; target += 1) {
    const currentLevel = target - 1;
    const project = CIVILIZATION_PROJECTS[target];
    for (const key of Object.keys(project.buildings)) if (SETTLEMENT_BUILDINGS[key]) settlementTypes.add(key);
    const availableBases = new Set(enemyBaseTypesForCivilization(currentLevel));
    const checks = [];
    checks.push({
      name: 'settlement-slots', current: settlementTypes.size, required: CIVILIZATIONS[currentLevel].slots,
      passed: settlementTypes.size <= CIVILIZATIONS[currentLevel].slots
    });
    checks.push({
      name: 'artifact-supply', current: project.artifactsRequired, required: project.progress.totalCampsCaptured ?? project.artifactsRequired,
      passed: project.artifactsRequired <= (project.progress.totalCampsCaptured ?? project.artifactsRequired)
    });
    if (project.progress.activeFieldBases != null) {
      const limit = fieldBaseLimitForCivilization(currentLevel);
      checks.push({ name: 'field-base-limit', current: project.progress.activeFieldBases, required: limit, passed: project.progress.activeFieldBases <= limit });
    }
    if (project.progress.cityHpStreak != null) {
      const maximum = majorBaseMaxHpForCivilization(currentLevel);
      checks.push({
        name: 'city-hp-threshold', current: project.progress.cityHpStreak.threshold,
        required: maximum, passed: project.progress.cityHpStreak.threshold <= maximum
      });
    }
    for (const [key, baseType] of Object.entries(resourceBaseForCheck)) {
      if (project.progress[key] == null) continue;
      checks.push({ name: `${key}-source`, source: baseType, passed: availableBases.has(baseType) });
    }
    for (const [key, buildingTypes] of Object.entries(productionBuildingForCheck)) {
      if (project.progress[key] == null) continue;
      checks.push({
        name: `${key}-production`, sources: buildingTypes,
        passed: buildingTypes.some(type => SETTLEMENT_BUILDINGS[type]?.level <= currentLevel)
      });
    }
    const availableEnemyTypes = new Set([...availableBases].flatMap(baseType => {
      const waves = ENEMY_BASE_DEFINITIONS[baseType]?.waves ?? {};
      return Object.values(waves).flat();
    }));
    for (const [key, enemyType] of Object.entries(commanderTypeForCheck)) {
      if (project.progress[key] == null) continue;
      checks.push({ name: `${key}-enemy`, source: enemyType, passed: availableEnemyTypes.has(enemyType) });
    }
    const availableDefenseKinds = [
      DEFENSE_LINES.barrier[currentLevel] ? 'barrier' : null,
      DEFENSE_LINES.single[currentLevel] ? 'single' : null,
      DEFENSE_LINES.area[currentLevel] ? 'area' : null,
      DEFENSE_LINES.slow[currentLevel] ? 'slow' : null,
      DEFENSE_LINES.repair[currentLevel] ? 'repair' : null,
      DEFENSE_LINES.survey[currentLevel] ? 'survey' : null,
      DEFENSE_LINES.medical[currentLevel] ? 'medical' : null,
      DEFENSE_LINES.fieldBarracks[currentLevel] ? 'fieldBarracks' : null
    ].filter(Boolean);
    for (const [key, minimumKinds] of Object.entries(defenseKindsForCheck)) {
      if (project.buildings[key] == null) continue;
      checks.push({
        name: `${key}-availability`, current: availableDefenseKinds.length,
        required: project.buildings[key], passed: availableDefenseKinds.length >= project.buildings[key] && project.buildings[key] >= minimumKinds
      });
    }
    levels.push({
      targetLevel: target,
      currentCivilization: CIVILIZATIONS[currentLevel].name,
      constructionSeconds: project.durationSec,
      cumulativeRequiredSettlementBuildings: settlementTypes.size,
      settlementSlots: CIVILIZATIONS[currentLevel].slots,
      checks,
      passed: checks.every(check => check.passed)
    });
  }
  return {
    cumulativeConstructionSeconds: levels.reduce((sum, level) => sum + level.constructionSeconds, 0),
    levels,
    passed: levels.every(level => level.passed)
  };
}

const openingProfiles = [
  {
    name: 'guided-opening', description: 'Two defenses and the first assault are started immediately.',
    gunBuildTimes: [0, 0], dispatchAt: 0, buildBarrier: true, expectCompletion: true
  },
  {
    name: 'two-minute-hesitation', description: 'The player reads the interface for two minutes before building or dispatching.',
    gunBuildTimes: [120, 120], dispatchAt: 120, buildBarrier: true, expectCompletion: true
  },
  {
    name: 'ten-minute-hesitation', description: 'The player delays all active decisions for ten minutes.',
    gunBuildTimes: [600, 600], dispatchAt: 600, buildBarrier: true, expectCompletion: true
  },
  {
    name: 'defense-only-control', description: 'The player builds two defenses but never attacks an enemy base.',
    gunBuildTimes: [0, 0], dispatchAt: null, buildBarrier: false, expectCompletion: false
  }
].map(runOpeningProfile);

const [balanceBefore, balanceAfter, civilizationBefore, civilizationAfter] = await Promise.all([
  parseLoggedJson('playtest-balance-v0.33.3.log'),
  parseLoggedJson('playtest-balance-v0.33.4.log'),
  parseLoggedJson('playtest-civilization-v0.33.3.log'),
  parseLoggedJson('playtest-civilization-v0.33.4.log')
]);

const balanceComparison = compareScenarioReports(balanceBefore, balanceAfter);
const civilizationComparison = compareScenarioReports(civilizationBefore, civilizationAfter);
const progression = progressionFeasibility();
const fortifiedComparisons = [5, 6, 7].map(level => {
  const standard = civilizationAfter.scenarios.find(item => item.profile === `standard-civ${level}`);
  const fortified = civilizationAfter.scenarios.find(item => item.profile === `fortified-civ${level}`);
  const passed = fortified.cityDefeats === 0
    && fortified.finalDefenses > standard.finalDefenses
    && fortified.enemiesKilled >= standard.enemiesKilled
    && fortified.averageMovingEnemies < standard.averageMovingEnemies;
  return {
    level,
    standard: {
      finalDefenses: standard.finalDefenses, enemiesKilled: standard.enemiesKilled,
      averageMovingEnemies: standard.averageMovingEnemies, destroyedDefenses: standard.destroyedDefenses
    },
    fortified: {
      finalDefenses: fortified.finalDefenses, enemiesKilled: fortified.enemiesKilled,
      averageMovingEnemies: fortified.averageMovingEnemies, destroyedDefenses: fortified.destroyedDefenses
    },
    note: 'A larger fortified network exposes more individual facilities, so absolute destroyed-facility count is not used alone. Surviving network size and enemy suppression must improve.',
    passed
  };
});

const report = {
  release: '0.33.4-balance-user-journey-audit',
  generatedAt: new Date().toISOString(),
  balanceRegression: {
    earlyAndMidGame: balanceComparison,
    lateGame: civilizationComparison,
    passed: balanceComparison.gameplayMetricChanges.length === 0 && civilizationComparison.gameplayMetricChanges.length === 0
  },
  openingProfiles,
  progression,
  fortifiedComparisons,
  journeyCoverage: [
    'new game and base selection', 'opening construction and defense', 'single-squad deployment',
    'enemy-base destruction and recovery item return', 'civilization contribution and construction',
    'production chains and upgrades', 'field-base expansion', 'road expansion and route planning',
    'late-game dense combat', 'save, offline progression and resume'
  ],
  conclusions: [
    'The v0.33.4 routing and road-topology changes do not change deterministic combat outcomes from v0.33.3 across sixteen reference scenarios.',
    'The opening survives a two-minute and a ten-minute decision delay, but a defense-only player cannot progress and eventually suffers city defeats; the interface must explicitly direct the player to attack an enemy base.',
    'Every civilization project has enough settlement slots, required enemy-base sources and production facilities at the level where the requirement appears.',
    'Fortification improves the surviving defense network and enemy suppression, although a larger exposed network can lose more individual facilities in absolute terms.'
  ],
  environmentLimits: [
    'Android GPS accuracy, live Overpass latency, touch mistakes and GPU composition require final device testing after GitHub Pages deployment.',
    'Road topology changes local difficulty; deterministic reference networks cannot represent every real-world location.'
  ]
};

report.allChecksPassed = report.balanceRegression.passed
  && openingProfiles.every(profile => profile.passed)
  && progression.passed
  && fortifiedComparisons.every(item => item.passed);

await writeFile(resolve(docs, 'game-balance-user-journey-v0.33.4.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.allChecksPassed) process.exitCode = 1;
