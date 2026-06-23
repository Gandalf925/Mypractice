import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { ensureCivilizationState, CivilizationSystem } from '../src/civilization/civilization-system.js';
import { addBundle, consumeBundle, recalculateCapacity } from '../src/civilization/inventory-system.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { CIVILIZATIONS, CIVILIZATION_PROJECTS, SETTLEMENT_BUILDINGS } from '../src/civilization/data.js';

function stateWithWorld() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'base', x: 30, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'base', length: 30 }]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  ensureCivilizationState(state, { initializeInventory: true });
  return state;
}

test('inventory has one canonical resource store and preserves overflow', () => {
  const state = stateWithWorld();
  const result = addBundle(state, { wood: 500 });
  assert.equal(state.inventory.resources.wood, 300);
  assert.equal(result.overflowed.wood, 350);
  assert.equal(consumeBundle(state, { wood: 32 }), true);
  recalculateCapacity(state);
  assert.equal(state.inventory.resources.wood, 300);
  assert.equal(state.inventory.overflow.wood.amount, 318);
});

test('production reserves inputs once and completes through the civilization update', () => {
  const state = stateWithWorld();
  state.civilization.level = 1;
  Object.assign(state.inventory.resources, { wood: 200, stone: 100, fiber: 100 });
  recalculateCapacity(state);
  const system = new CivilizationSystem();
  const built = system.settlement.build(state, 'carpentry');
  assert.equal(built.ok, true);
  const queued = system.production.enqueue(state, built.building.id, 'timber', 1);
  assert.equal(queued.ok, true);
  const woodAfterReservation = state.inventory.resources.wood;
  system.update(state, 60);
  assert.equal(state.inventory.resources.wood, woodAfterReservation);
  assert.equal(state.inventory.resources.timber, 1);
  assert.equal(state.civilization.progress.totalProduced.timber, 1);
});

test('removed resource outpost subsystem is absent from civilization runtime', () => {
  const system = new CivilizationSystem();
  assert.equal('outposts' in system, false);
});


test('settlement damage ruins a building and disables its production', () => {
  const state = stateWithWorld();
  state.civilization.level = 1;
  Object.assign(state.inventory.resources, { wood: 300, stone: 300, fiber: 300 });
  recalculateCapacity(state);
  const system = new CivilizationSystem();
  const building = system.settlement.build(state, 'carpentry').building;
  state.combat.pendingSettlementDamage = [{ enemyId: 'siege-1', enemyType: 'siegeBreaker', damage: 999 }];
  system.update(state, 0);
  assert.equal(building.ruined, true);
  assert.equal(building.hp, 0);
  assert.equal(system.production.enqueue(state, building.id, 'timber').ok, false);
});

test('production overflow stays in the building buffer until collection', () => {
  const state = stateWithWorld();
  state.civilization.level = 1;
  Object.assign(state.inventory.resources, { wood: 300, stone: 300, fiber: 300, timber: 200 });
  recalculateCapacity(state);
  const system = new CivilizationSystem();
  const building = system.settlement.build(state, 'carpentry').building;
  state.inventory.resources.timber = state.inventory.capacity.processed;
  assert.equal(system.production.enqueue(state, building.id, 'timber').ok, true);
  system.update(state, 60);
  assert.equal(building.outputBuffer.timber, 1);
  assert.equal(state.inventory.overflow.timber, undefined);
  state.inventory.resources.timber -= 1;
  assert.equal(system.production.collectOutput(state, building.id).ok, true);
  assert.equal(building.outputBuffer.timber ?? 0, 0);
});


test('every civilization project uses implemented requirements and fits the unlocked settlement slots', () => {
  const supportedBuildings = new Set([
    ...Object.keys(SETTLEMENT_BUILDINGS), 'barrier0', 'single0', 'otherDefense0',
    'upgradedDefenses', 'upgradedDefenseKinds', 'barrier2', 'gate2', 'gate3',
    'bronzeDefenses', 'bronzeDefenseKinds', 'wallAtLeast2'
  ]);
  const supportedProgress = new Set([
    'totalKills', 'totalCampsCaptured', 'totalRepairHpPaid', 'totalProduced',
    'selfProducedBronze', 'selfProducedWroughtIron', 'perfectWaveStreak',
    'siegeCaptainsDefeated', 'activeFieldBases', 'copperCampsCaptured',
    'tinCampsCaptured', 'ironCampsCaptured', 'cityHpStreak'
  ]);
  for (const [target, project] of Object.entries(CIVILIZATION_PROJECTS)) {
    assert.equal(project.target, Number(target));
    for (const key of Object.keys(project.buildings)) assert.equal(supportedBuildings.has(key), true, `unsupported building requirement: ${key}`);
    for (const key of Object.keys(project.progress)) assert.equal(supportedProgress.has(key), true, `unsupported progress requirement: ${key}`);
    const cumulativeSettlementBuildings = Object.entries(CIVILIZATION_PROJECTS)
      .filter(([level]) => Number(level) <= Number(target))
      .flatMap(([, definition]) => Object.keys(definition.buildings).filter(key => SETTLEMENT_BUILDINGS[key]));
    assert.ok(new Set(cumulativeSettlementBuildings).size <= CIVILIZATIONS[Number(target) - 1].slots);
  }
});
