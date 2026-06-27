import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  CIVILIZATIONS,
  CIVILIZATION_PROJECTS,
  DEFENSE_LINES,
  MAX_CIVILIZATION_LEVEL,
  PRODUCTION_RECIPES,
  SETTLEMENT_BUILDINGS
} from '../src/civilization/data.js';
import { resourceCategory } from '../src/civilization/inventory-system.js';
import { ensureProject } from '../src/civilization/progression-system.js';
import { defensePresentation, uniqueDefenseDescriptionParagraphs } from '../src/combat/defense-presentation.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS,
  friendlyEquipmentScaling,
  friendlySquadRuntimeDefinition
} from '../src/combat/friendly-force-definitions.js';
import {
  friendlyCoordinatedDeploymentLimit,
  friendlyGlobalCommandLimit
} from '../src/combat/friendly-force-system.js';
import {
  baseLimitForCivilization,
  majorBaseMaxHpForCivilization,
  synchronizeOwnedBaseDurability
} from '../src/base/player-bases.js';
import {
  fieldBaseLimitForCivilization,
  fieldBaseMaxHpForCivilization,
  synchronizeFieldBaseDurability
} from '../src/base/field-bases.js';
import { majorBaseBuildRange, fieldBaseBuildRange } from '../src/base/construction-range.js';
import {
  ENEMY_LEVEL_MULTIPLIERS,
  ENEMY_DENSITY_BY_CIVILIZATION,
  enemyBaseLevelForState,
  enemyDensityForState
} from '../src/combat/enemy-scaling.js';
import { ENEMY_GENERATIONS } from '../src/combat/definitions.js';
import {
  MAX_ACTIVE_ENEMY_BASES,
  WaveSystem,
  enemyBaseTypesForCivilization,
  synchronizeEnemyBaseNetwork
} from '../src/combat/wave-system.js';

function levelState(level = 7) {
  const state = createInitialState();
  state.civilization.level = level;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'v0330-test', roadSpecVersion: 2,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'enemy', x: 300, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'enemy', length: 300, roadWidth: 6 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ id: 'home-base', name: '本拠地', primary: true, kind: 'MAJOR', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100, establishedAt: 1 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.inventory.capacity = { base: 100000, processed: 100000, ore: 100000, metal: 100000 };
  for (const key of Object.keys(state.inventory.resources)) state.inventory.resources[key] = 10000;
  return state;
}

test('civilization data extends cleanly through level seven', () => {
  assert.equal(MAX_CIVILIZATION_LEVEL, 7);
  assert.equal(CIVILIZATIONS.length, 8);
  assert.deepEqual(CIVILIZATIONS.map(item => item.level), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Object.keys(CIVILIZATION_PROJECTS).map(Number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(CIVILIZATIONS[5].name, '鋼鉄城塞');
  assert.equal(CIVILIZATIONS[6].name, '機械都市');
  assert.equal(CIVILIZATIONS[7].name, '街道連邦');
  const state = levelState(7);
  assert.equal(ensureProject(state), null);
});

test('level seven removes territory limits while keeping bounded construction reach', () => {
  assert.equal(baseLimitForCivilization(6), 6);
  assert.equal(fieldBaseLimitForCivilization(6), 6);
  assert.equal(baseLimitForCivilization(7), Infinity);
  assert.equal(fieldBaseLimitForCivilization(7), Infinity);
  assert.equal(baseLimitForCivilization(99), Infinity);
  assert.equal(fieldBaseLimitForCivilization(99), Infinity);
  assert.equal(majorBaseBuildRange(7), 345);
  assert.equal(fieldBaseBuildRange(7), 255);
  assert.ok(majorBaseBuildRange(7) < 1250 / 3);
});

test('late resources, recipes and settlement facilities all have canonical definitions', () => {
  assert.equal(resourceCategory('steel'), 'metal');
  assert.equal(resourceCategory('mechanism'), 'metal');
  assert.equal(PRODUCTION_RECIPES.steel.level, 5);
  assert.equal(PRODUCTION_RECIPES.mechanism.level, 6);
  assert.equal(PRODUCTION_RECIPES.integratedSteel.level, 7);
  assert.equal(PRODUCTION_RECIPES.integratedMechanism.level, 7);
  for (const [type, definition] of Object.entries(SETTLEMENT_BUILDINGS)) {
    assert.ok(definition.name?.trim(), `${type} requires a name`);
    assert.ok(definition.description?.trim(), `${type} requires a description`);
    assert.ok(Number.isInteger(definition.level) && definition.level >= 1 && definition.level <= 7, `${type} level`);
    assert.ok(definition.cost && Object.keys(definition.cost).length, `${type} cost`);
  }
});

test('every defense line has a complete late-game tier and one non-duplicated explanation', () => {
  const requiredStart = { barrier: 0, single: 0, area: 0, slow: 0, repair: 0, medical: 1, fieldBarracks: 1, survey: 1, gate: 2 };
  const presentationTypes = { barrier: 'barrier', single: 'gun', area: 'mortar', slow: 'slow', repair: 'relay', medical: 'medical', fieldBarracks: 'fieldBarracks', survey: 'survey', gate: 'gate' };
  for (const [line, start] of Object.entries(requiredStart)) {
    assert.equal(DEFENSE_LINES[line].length, 8, `${line} must address levels 0-7`);
    for (let tier = start; tier <= 7; tier += 1) {
      const definition = DEFENSE_LINES[line][tier];
      assert.ok(definition?.name?.trim(), `${line} tier ${tier} name`);
      assert.ok(definition.hp > 0, `${line} tier ${tier} hp`);
      const presentation = defensePresentation(presentationTypes[line], definition);
      assert.ok(presentation?.role?.trim(), `${line} role`);
      assert.ok(presentation?.summary?.trim(), `${line} summary`);
      assert.ok(presentation?.effect?.trim(), `${line} effect`);
      assert.ok(presentation?.placement?.trim(), `${line} placement`);
      const paragraphs = uniqueDefenseDescriptionParagraphs(presentation, [presentation.effect, presentation.placement]);
      assert.deepEqual(paragraphs, [presentation.summary, presentation.effect, presentation.placement]);
    }
  }
  assert.notEqual(defensePresentation('gate', DEFENSE_LINES.gate[7]).summary, defensePresentation('barrier', DEFENSE_LINES.barrier[7]).summary);
});

test('late friendly forces unlock with equipment scaling but retain finite command limits', () => {
  assert.equal(FRIENDLY_SQUAD_DEFINITIONS.engineer.unlockLevel, 5);
  assert.equal(FRIENDLY_SQUAD_DEFINITIONS.artillery.unlockLevel, 6);
  assert.equal(FRIENDLY_SQUAD_DEFINITIONS.command.unlockLevel, 7);
  for (const [type, definition] of Object.entries(FRIENDLY_SQUAD_DEFINITIONS)) {
    assert.ok(definition.description?.trim(), `${type} description`);
    assert.ok(definition.role?.trim(), `${type} role`);
  }
  assert.deepEqual(friendlyEquipmentScaling(7), { hp: 1.42, damage: 1.38, speed: 1.05 });
  const state = levelState(7);
  const assault = friendlySquadRuntimeDefinition(state, 'assault');
  assert.equal(assault.hp, 256);
  assert.ok(Math.abs(assault.enemyDps - 12.42) < 1e-9);
  assert.equal(friendlyGlobalCommandLimit(state), 40);
  assert.equal(friendlyCoordinatedDeploymentLimit(state), 8);
});

test('late enemy generations and density remain hard-capped', () => {
  assert.deepEqual(Object.keys(ENEMY_GENERATIONS).map(Number), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(Object.keys(ENEMY_LEVEL_MULTIPLIERS).length, 8);
  assert.equal(Object.keys(ENEMY_DENSITY_BY_CIVILIZATION).length, 8);
  const state = levelState(7);
  state.civilization.completedAt = state.runtime.worldTimeMs - 2 * 60 * 60 * 1000;
  assert.deepEqual(enemyDensityForState(state), ENEMY_DENSITY_BY_CIVILIZATION[7]);
  assert.equal(enemyDensityForState(state).populationCap, 860);
  assert.equal(enemyBaseLevelForState(state, Number.MAX_SAFE_INTEGER), 8);
});

test('enemy base network upgrades old advanced camps and never plans more than ten active types', () => {
  const state = levelState(7);
  const types = ['barracks', 'engineer', 'raider', 'motor', 'copperCamp', 'tinCamp', 'ironCamp', 'bronzeCamp', 'siegeWorks'];
  state.world.enemyBases = types.map((type, index) => ({
    id: `base-${type}`, type, nodeId: index % 2 ? 'enemy' : 'home', hp: 120, maxHp: 120,
    alive: true, level: 5, ageSeconds: 1000, spawnClock: 9999, wavesSent: 12
  }));
  synchronizeEnemyBaseNetwork(state);
  const activeTypes = state.world.enemyBases.filter(base => base.alive).map(base => base.type);
  assert.equal(activeTypes.includes('bronzeCamp'), false);
  assert.equal(activeTypes.includes('siegeWorks'), false);
  assert.equal(activeTypes.includes('steelCamp'), true);
  assert.equal(activeTypes.includes('machineWorks'), true);
  assert.equal(enemyBaseTypesForCivilization(7).length, MAX_ACTIVE_ENEMY_BASES);
  assert.deepEqual(enemyBaseTypesForCivilization(7), [
    'barracks', 'engineer', 'raider', 'motor', 'copperCamp', 'tinCamp', 'ironCamp', 'steelCamp', 'machineWorks', 'commandFortress'
  ]);
});

test('a carried wave clock launches only one wave per update instead of dumping its backlog', () => {
  const state = levelState(7);
  state.world.enemyBases = [{
    id: 'base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true,
    level: 8, ageSeconds: 999999, spawnClock: 999999, wavesSent: 0
  }];
  state.combat.waves.resourceBaseCheckClock = 0;
  let launches = 0;
  class CountingWaveSystem extends WaveSystem {
    spawnWave(_state, base) { launches += 1; base.wavesSent += 1; return 1; }
  }
  new CountingWaveSystem(null).update(state, 0.25);
  assert.equal(launches, 1);
  assert.ok(state.world.enemyBases[0].spawnClock >= 0);
});

test('civilization durability upgrades preserve existing health percentages', () => {
  const state = levelState(4);
  state.world.playerBases[0].maxHp = 170;
  state.world.playerBases[0].hp = 85;
  state.world.city.maxHp = 170;
  state.world.city.hp = 85;
  state.world.fieldBases = [{ id: 'field', kind: 'FIELD', name: '簡易拠点', status: 'ESTABLISHED', nodeId: 'enemy', x: 300, y: 0, hp: 50, maxHp: 100, establishedAt: 2 }];
  synchronizeOwnedBaseDurability(state, 7);
  synchronizeFieldBaseDurability(state, 7);
  assert.equal(state.world.playerBases[0].maxHp, majorBaseMaxHpForCivilization(7));
  assert.equal(state.world.playerBases[0].hp, Math.round(majorBaseMaxHpForCivilization(7) * 0.5));
  assert.equal(state.world.city.hp, state.world.playerBases[0].hp);
  assert.equal(state.world.fieldBases[0].maxHp, fieldBaseMaxHpForCivilization(7));
  assert.equal(state.world.fieldBases[0].hp, Math.round(fieldBaseMaxHpForCivilization(7) * 0.5));
});

function stationedSquad(state, id, type) {
  const definition = friendlySquadRuntimeDefinition(state, type);
  return {
    id, type, hp: definition.hp, maxHp: definition.hp, members: definition.members,
    originBaseId: 'home-base', targetBaseId: null, missionTargetBaseId: null, targetEnemyId: null,
    missionType: 'ATTACK', nodeId: 'home', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    status: 'HALTED', order: 'HOLD', commandDestinationNodeId: 'home', travelHistoryNodeIds: ['home'],
    engagedEnemyId: null, combatCooldown: 0, departDelay: 0, formationId: null, formationTargetId: null,
    formationSpeed: null, formationSize: null, recoveryBaseId: null, recoveryStartedAt: null,
    reorganizationRemaining: 0, readyAt: null, deployedAt: 1
  };
}

function enemyAtHome(id, hp = 1000) {
  return {
    id, type: 'infantry', level: 1, hp, maxHp: hp, nodeId: 'home', path: null, pathIndex: 0,
    edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0,
    sourceBaseId: 'base', waveId: null, waveResolved: false, rewardGranted: false, reroutePending: false,
    routeBias: 1, targetDefenseId: null, targetFieldBaseId: null, notifiedDefenseIds: [], engagedSquadId: null
  };
}

test('engineer repair, artillery splash and command aura operate in live friendly combat', async () => {
  const { FriendlyForceSystem, repairNearbyDefenseWithEngineer } = await import('../src/combat/friendly-force-system.js');

  const repairState = levelState(7);
  const engineer = stationedSquad(repairState, 'engineer-squad', 'engineer');
  repairState.combat.friendlySquads = [engineer];
  repairState.combat.defenses = [{
    id: 'damaged-tower', type: 'gun', kind: 'tower', line: 'single', tier: 0, defenseKey: 'single0',
    nodeId: 'home', position: { x: 0, y: 0 }, hp: 50, maxHp: 150, disabledTimer: 0
  }];
  const repair = repairNearbyDefenseWithEngineer(repairState, engineer.id);
  assert.equal(repair.ok, true);
  assert.equal(repairState.combat.defenses[0].hp, 150);

  const artilleryState = levelState(7);
  const artillery = stationedSquad(artilleryState, 'artillery-squad', 'artillery');
  artilleryState.combat.friendlySquads = [artillery];
  artilleryState.combat.enemies = [enemyAtHome('primary'), enemyAtHome('splash-a'), enemyAtHome('splash-b')];
  const artillerySpatial = {
    positions: new Map(artilleryState.combat.enemies.map(enemy => [enemy.id, { x: 0, y: 0 }])),
    query() { return artilleryState.combat.enemies.map(enemy => ({ enemy, position: { x: 0, y: 0 } })); }
  };
  new FriendlyForceSystem().update(artilleryState, 1, artillerySpatial, squad => squad.id === artillery.id);
  assert.ok(artilleryState.combat.enemies[0].hp < 1000);
  assert.ok(artilleryState.combat.enemies[1].hp < 1000);
  assert.ok(artilleryState.combat.enemies[2].hp < 1000);

  function assaultDamage(withCommand) {
    const state = levelState(7);
    const assault = stationedSquad(state, 'assault-squad', 'assault');
    state.combat.friendlySquads = withCommand ? [assault, stationedSquad(state, 'command-squad', 'command')] : [assault];
    state.combat.enemies = [enemyAtHome('target')];
    const spatial = {
      positions: new Map([['target', { x: 0, y: 0 }]]),
      query() { return [{ enemy: state.combat.enemies[0], position: { x: 0, y: 0 } }]; }
    };
    new FriendlyForceSystem().update(state, 1, spatial, squad => squad.id === assault.id);
    return 1000 - state.combat.enemies[0].hp;
  }
  assert.ok(assaultDamage(true) > assaultDamage(false));
});
