import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState, validateState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { ProductionSystem } from '../src/civilization/production-system.js';
import { ProgressionSystem } from '../src/civilization/progression-system.js';
import { CIVILIZATION_PROJECTS, PRODUCTION_RECIPES } from '../src/civilization/data.js';
import { ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS } from '../src/combat/definitions.js';
import { damageEnemy, EnemySystem, spawnEnemy } from '../src/combat/enemy-system.js';
import { findCombatPath } from '../src/combat/routing-system.js';
import { waveForBase } from '../src/combat/wave-system.js';
import { FRIENDLY_SQUAD_DEFINITIONS, friendlySquadEnemyDamage } from '../src/combat/friendly-force-definitions.js';
import { PlayerBaseSystem } from '../src/base/player-base-system.js';
import { ensurePlayerBaseState } from '../src/base/player-bases.js';

function graphState(nodes, edges, cityId = nodes.at(-1).id) {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'integrity-test', roadSpecVersion: 4, nodes, edges
  });
  const city = state.world.roadGraph.nodeById.get(cityId);
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: cityId, x: city.x, y: city.y, establishedAt: 1 };
  state.world.city = { nodeId: cityId, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [];
  state.world.enemyBases = [];
  state.combat.enemies = [];
  state.combat.defenses = [];
  state.combat.friendlySquads = [];
  state.runtime.combatInitialized = true;
  return state;
}

function sourceBase(nodeId = 'start', overrides = {}) {
  return { id: 'source-base', type: 'barracks', nodeId, alive: true, hp: 100, maxHp: 100, level: 1, wavesSent: 0, ...overrides };
}

test('resource outpost runtime is completely removed while legacy saves are safely stripped', async () => {
  const productionFiles = [
    'src/core/state-schema.js',
    'src/civilization/civilization-system.js',
    'src/rendering/combat-renderer.js',
    'src/ui/combat-ui.js',
    'src/civilization/data.js'
  ];
  for (const file of productionFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    if (file.endsWith('civilization-system.js')) assert.doesNotMatch(source, /OutpostSystem|RESOURCE_OUTPOSTS/);
    else assert.doesNotMatch(source, /outpost|資源前哨地/i);
  }
  const state = createInitialState();
  state.world.outposts = [{ id: 'legacy' }];
  ensureCivilizationState(state);
  assert.equal('outposts' in state.world, false);
});

test('resource-camp capture rewards cover the mandatory ore gates of later civilization projects', () => {
  const trial = PRODUCTION_RECIPES.trialBronze;
  const bronzeRequired = CIVILIZATION_PROJECTS[3].progress.selfProducedBronze;
  const bronzeRuns = Math.ceil(bronzeRequired / trial.output.bronzeIngot);
  const copperOreNeeded = bronzeRuns * trial.input.copperIngot * PRODUCTION_RECIPES.copperIngot.input.copperOre;
  const tinOreNeeded = bronzeRuns * trial.input.tinIngot * PRODUCTION_RECIPES.tinIngot.input.tinOre;
  assert.ok(ENEMY_BASE_DEFINITIONS.copperCamp.reward.copperOre >= copperOreNeeded);
  assert.ok(ENEMY_BASE_DEFINITIONS.tinCamp.reward.tinOre >= tinOreNeeded);

  const ironRequired = CIVILIZATION_PROJECTS[4].progress.selfProducedWroughtIron;
  const ironOreNeeded = ironRequired * PRODUCTION_RECIPES.ironBloom.input.ironOre;
  assert.ok(ENEMY_BASE_DEFINITIONS.ironCamp.reward.ironOre * CIVILIZATION_PROJECTS[4].progress.ironCampsCaptured >= ironOreNeeded);
});

test('project-only trial bronze goes directly to the active project and cannot be overproduced', () => {
  const state = createInitialState();
  state.civilization.level = 2;
  ensureCivilizationState(state, { initializeInventory: true });
  state.civilization.buildings.push({
    id: 'trial-furnace', type: 'trialBronzeFurnace', hp: 240, maxHp: 240,
    outputBuffer: {}, history: { produced: 0, repairs: 0 }
  });
  Object.assign(state.inventory.resources, { copperIngot: 3, tinIngot: 1, charcoal: 2, bronzeIngot: 0 });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  state.civilization.project.contributions.bronzeIngot = 20;
  const production = new ProductionSystem();
  const queued = production.enqueue(state, 'trial-furnace', 'trialBronze', 10);
  assert.equal(queued.ok, true);
  assert.equal(queued.queue.orders[0].remaining, 1);
  production.update(state, PRODUCTION_RECIPES.trialBronze.seconds);
  assert.equal(state.civilization.project.contributions.bronzeIngot, 24);
  assert.equal(state.inventory.resources.bronzeIngot, 0);
  assert.equal(state.civilization.progress.selfProducedBronze, 4);
  assert.equal(production.enqueue(state, 'trial-furnace', 'trialBronze', 1).ok, false);
});

test('actual smelting chains turn scheduled resource-camp rewards into the mandatory bronze and iron progression totals', () => {
  const bronzeState = createInitialState();
  bronzeState.civilization.level = 2;
  ensureCivilizationState(bronzeState, { initializeInventory: true });
  bronzeState.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  bronzeState.civilization.buildings.push(
    { id: 'copper', type: 'copperFurnace', hp: 240, maxHp: 240, outputBuffer: {}, history: { produced: 0, repairs: 0 } },
    { id: 'tin', type: 'tinFurnace', hp: 240, maxHp: 240, outputBuffer: {}, history: { produced: 0, repairs: 0 } },
    { id: 'trial', type: 'trialBronzeFurnace', hp: 240, maxHp: 240, outputBuffer: {}, history: { produced: 0, repairs: 0 } }
  );
  Object.assign(bronzeState.inventory.resources, {
    copperOre: ENEMY_BASE_DEFINITIONS.copperCamp.reward.copperOre,
    tinOre: ENEMY_BASE_DEFINITIONS.tinCamp.reward.tinOre,
    charcoal: 60
  });
  const bronzeProduction = new ProductionSystem();
  assert.equal(bronzeProduction.enqueue(bronzeState, 'copper', 'copperIngot', 18).ok, true);
  assert.equal(bronzeProduction.enqueue(bronzeState, 'tin', 'tinIngot', 6).ok, true);
  bronzeProduction.update(bronzeState, 18 * PRODUCTION_RECIPES.copperIngot.seconds);
  assert.ok(bronzeState.inventory.resources.copperIngot >= 18);
  assert.ok(bronzeState.inventory.resources.tinIngot >= 6);
  assert.equal(bronzeProduction.enqueue(bronzeState, 'trial', 'trialBronze', 6).ok, true);
  bronzeProduction.update(bronzeState, 6 * PRODUCTION_RECIPES.trialBronze.seconds);
  assert.equal(bronzeState.civilization.project.contributions.bronzeIngot, 24);
  assert.equal(bronzeState.civilization.progress.selfProducedBronze, 24);

  const ironState = createInitialState();
  ironState.civilization.level = 3;
  ensureCivilizationState(ironState, { initializeInventory: true });
  ironState.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  ironState.civilization.buildings.push(
    { id: 'bloomery', type: 'bloomery', hp: 240, maxHp: 240, outputBuffer: {}, history: { produced: 0, repairs: 0 } },
    { id: 'forge', type: 'forge', hp: 240, maxHp: 240, outputBuffer: {}, history: { produced: 0, repairs: 0 } }
  );
  Object.assign(ironState.inventory.resources, {
    ironOre: ENEMY_BASE_DEFINITIONS.ironCamp.reward.ironOre * CIVILIZATION_PROJECTS[4].progress.ironCampsCaptured,
    charcoal: 180
  });
  const ironProduction = new ProductionSystem();
  assert.equal(ironProduction.enqueue(ironState, 'bloomery', 'ironBloom', 30).ok, true);
  ironProduction.update(ironState, 30 * PRODUCTION_RECIPES.ironBloom.seconds);
  assert.equal(ironState.inventory.resources.ironBloom, 30);
  assert.equal(ironProduction.enqueue(ironState, 'forge', 'wroughtIron', 30).ok, true);
  ironProduction.update(ironState, 30 * PRODUCTION_RECIPES.wroughtIron.seconds);
  assert.equal(ironState.inventory.resources.wroughtIron, 30);
  assert.equal(ironState.civilization.progress.selfProducedWroughtIron, 30);
  const contribution = new ProgressionSystem().contribute(ironState, 'wroughtIron', 30);
  assert.equal(contribution.ok, true);
  assert.equal(ironState.civilization.project.contributions.wroughtIron, 30);
});

test('wave doctrine changes actual routing and resource-base composition rather than only the label', () => {
  const state = graphState([
    { id: 'start', x: -100, y: 0 },
    { id: 'middle', x: 0, y: 0 },
    { id: 'outer-a', x: -60, y: 90 },
    { id: 'outer-b', x: 60, y: 90 },
    { id: 'city', x: 100, y: 0 }
  ], [
    { id: 'direct-a', a: 'start', b: 'middle', length: 100 },
    { id: 'direct-b', a: 'middle', b: 'city', length: 100 },
    { id: 'outer-a', a: 'start', b: 'outer-a', length: 98.5 },
    { id: 'outer-mid', a: 'outer-a', b: 'outer-b', length: 120 },
    { id: 'outer-b', a: 'outer-b', b: 'city', length: 98.5 }
  ], 'city');
  const normal = findCombatPath(state, 'start', 'city', 'infantry');
  const flankDoctrine = findCombatPath(state, 'start', 'city', 'infantry', null, 1, 1, 'flank');
  assert.deepEqual(normal.edgeIds, ['direct-a', 'direct-b']);
  assert.deepEqual(flankDoctrine.edgeIds, ['outer-a', 'outer-mid', 'outer-b']);
  assert.equal(flankDoctrine.routeMode, 'FLANK');

  state.civilization.level = 4;
  state.runtime.worldTimeMs = 10_000_000;
  state.civilization.completedAt = state.runtime.worldTimeMs - 2 * 60 * 60 * 1000;
  const resourceWave = waveForBase(state, { id: 'resource-base', type: 'copperCamp', level: 5, wavesSent: 7 }, 'hunt');
  assert.ok(resourceWave.includes('squadHunter'));
});

test('upgraded tower ranges affect evasive route selection', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'direct', x: 100, y: 0 },
    { id: 'outer', x: 100, y: 100 },
    { id: 'tower', x: 100, y: -100 },
    { id: 'city', x: 200, y: 0 }
  ], [
    { id: 'direct-a', a: 'start', b: 'direct', length: 100 },
    { id: 'direct-b', a: 'direct', b: 'city', length: 100 },
    { id: 'outer-a', a: 'start', b: 'outer', length: 100 },
    { id: 'outer-b', a: 'outer', b: 'city', length: 250 }
  ], 'city');
  const tower = { id: 'mortar', kind: 'tower', type: 'mortar', line: 'area', tier: 0, nodeId: 'tower', hp: 150, maxHp: 150 };
  state.combat.defenses = [tower];
  assert.deepEqual(findCombatPath(state, 'start', 'city', 'scout').edgeIds, ['direct-a', 'direct-b']);
  tower.tier = 4;
  tower.maxHp = tower.hp = 380;
  assert.deepEqual(findCombatPath(state, 'start', 'city', 'scout').edgeIds, ['outer-a', 'outer-b']);
});

test('shield tiers use their declared protection values and new enemies use correct friendly matchups', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'city', x: 100, y: 0 }
  ], [{ id: 'road', a: 'start', b: 'city', length: 100 }], 'city');
  const damageWith = shieldType => {
    const target = { id: 'target', type: 'infantry', hp: 100, maxHp: 100, nodeId: 'start', edgeId: null, edgeProgress: 0, departDelay: 0 };
    const shield = { id: 'shield', type: shieldType, hp: 100, maxHp: 100, nodeId: 'start', edgeId: null, edgeProgress: 0, departDelay: 0 };
    state.combat.enemies = [target, shield];
    damageEnemy(state, target, 50);
    return 100 - target.hp;
  };
  assert.ok(Math.abs(damageWith('shield') - 35) < 0.001);
  assert.ok(Math.abs(damageWith('bronzeShield') - 32.5) < 0.001);
  assert.ok(Math.abs(damageWith('bodyguard') - 29) < 0.001);

  const skirmisher = FRIENDLY_SQUAD_DEFINITIONS.skirmisher;
  const normal = friendlySquadEnemyDamage(skirmisher, 'infantry');
  for (const light of ['pathfinder', 'marauder', 'flankRider', 'warDrummer', 'squadHunter']) {
    assert.ok(friendlySquadEnemyDamage(skirmisher, light) > normal);
  }
  for (const armored of ['sapper', 'ironSaboteur', 'bodyguard']) {
    assert.ok(friendlySquadEnemyDamage(skirmisher, armored) < normal);
  }
});

test('hunters abandon squads outside their pursuit radius', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'near', x: 100, y: 0 },
    { id: 'city', x: 300, y: 0 },
    { id: 'far', x: 1000, y: 0 }
  ], [
    { id: 'a', a: 'start', b: 'near', length: 100 },
    { id: 'b', a: 'near', b: 'city', length: 200 },
    { id: 'c', a: 'city', b: 'far', length: 700 }
  ], 'city');
  const squad = { id: 'squad', type: 'assault', hp: 100, maxHp: 180, status: 'OUTBOUND', order: 'ADVANCE', nodeId: 'near', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0 };
  state.combat.friendlySquads = [squad];
  const enemy = spawnEnemy(state, sourceBase(), 'squadHunter');
  const system = new EnemySystem();
  system.update(state, 0.1);
  assert.equal(enemy.targetSquadId, squad.id);
  squad.nodeId = 'far';
  system.update(state, 0.1);
  assert.equal(enemy.targetSquadId, null);
});

test('additional major bases are real attack targets, can be destroyed, persist, and rebuild on site', () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'major', x: 80, y: 0 },
    { id: 'city', x: 0, y: 80 }
  ], [
    { id: 'to-major', a: 'start', b: 'major', length: 80 },
    { id: 'to-city', a: 'start', b: 'city', length: 80 }
  ], 'city');
  const major = { id: 'major-base', name: '主要拠点 2', status: 'ESTABLISHED', primary: false, nodeId: 'major', x: 80, y: 0, hp: 5, maxHp: 100, establishedAt: 2 };
  state.world.playerBases.push(major);
  const enemy = spawnEnemy(state, sourceBase(), 'infantry', 0, 'wave', 'raid');
  const system = new EnemySystem();
  system.update(state, 0.1);
  assert.equal(enemy.targetPlayerBaseId, major.id);
  enemy.edgeProgress = 79.9;
  system.update(state, 1);
  assert.equal(major.status, 'DESTROYED');
  assert.equal(major.hp, 0);
  assert.equal(validateState(state).valid, true);

  state.player.worldPosition = { x: 80, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  state.player.locationAccuracy = 5;
  Object.assign(state.inventory.resources, { timber: 20, rope: 20, cutStone: 20 });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  const rebuilt = new PlayerBaseSystem().rebuild(state, major.id, 100_000);
  assert.equal(rebuilt.ok, true);
  assert.equal(major.status, 'ESTABLISHED');
  assert.equal(major.hp, 100);
});

test('spawned and legacy-loaded enemies retain their defined visual radius and field-base UI lists retrieval units', async () => {
  const state = graphState([
    { id: 'start', x: 0, y: 0 },
    { id: 'city', x: 100, y: 0 }
  ], [{ id: 'road', a: 'start', b: 'city', length: 100 }], 'city');
  const enemy = spawnEnemy(state, sourceBase(), 'bodyguard');
  assert.equal(enemy.radius, ENEMY_DEFINITIONS.bodyguard.radius);
  enemy.radius = null;
  new EnemySystem().update(state, 0.01);
  assert.equal(enemy.radius, ENEMY_DEFINITIONS.bodyguard.radius);

  const source = await readFile(new URL('../src/ui/base-command-ui.js', import.meta.url), 'utf8');
  assert.match(source, /突撃／遊撃／回収部隊/);
});

test('destroyed major-base ruins still occupy their slot and block overlapping replacement placement', () => {
  const state = graphState([
    { id: 'city', x: 0, y: 0 },
    { id: 'ruin', x: 400, y: 0 },
    { id: 'other', x: 800, y: 0 }
  ], [
    { id: 'a', a: 'city', b: 'ruin', length: 400 },
    { id: 'b', a: 'ruin', b: 'other', length: 400 }
  ], 'city');
  state.civilization.level = 2;
  state.world.playerBases.push({ id: 'ruin-base', name: '主要拠点 2', primary: false, status: 'DESTROYED', nodeId: 'ruin', x: 400, y: 0, hp: 0, maxHp: 100, establishedAt: 2 });
  ensurePlayerBaseState(state);
  state.player.worldPosition = { x: 400, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  state.player.locationAccuracy = 5;
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, cutStone: 100 });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  const preview = new PlayerBaseSystem().previewCurrentLocation(state, 100_000);
  assert.equal(preview.ok, false);
  assert.match(preview.reason, /220m以上/);
});
