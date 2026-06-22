import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { ensureCivilizationState, CivilizationSystem } from '../src/civilization/civilization-system.js';
import { addBundle, consumeBundle, recalculateCapacity } from '../src/civilization/inventory-system.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';

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

test('enemy base capture requires the player to be on site and progresses over time', () => {
  const state = stateWithWorld();
  state.world.enemyBases = [{ id: 'camp', type: 'barracks', nodeId: 'base', alive: true, captured: false, captureProgress: 0 }];
  const system = new CivilizationSystem();
  state.player.worldPosition = { x: 100, y: 0 };
  assert.equal(system.outposts.beginCapture(state, 'camp').ok, false);
  state.player.worldPosition = { x: 30, y: 0 };
  assert.equal(system.outposts.beginCapture(state, 'camp').ok, true);
  system.update(state, 45);
  assert.equal(state.world.enemyBases[0].alive, false);
  assert.equal(state.world.outposts.length, 1);
  assert.equal(state.world.outposts[0].status, 'RUINED');
  assert.equal(state.world.baseRespawns.length, 1);
  assert.equal(state.statistics.campsCaptured, 1);
});


test('a captured outpost must be restored before it becomes active', () => {
  const state = stateWithWorld();
  state.world.enemyBases = [{ id: 'camp', type: 'barracks', nodeId: 'base', alive: true, captured: false, captureProgress: 0 }];
  const system = new CivilizationSystem();
  state.player.worldPosition = { x: 30, y: 0 };
  system.outposts.beginCapture(state, 'camp');
  system.update(state, 45);
  const outpost = state.world.outposts[0];
  assert.equal(outpost.status, 'RUINED');
  Object.assign(state.inventory.resources, { wood: 300, stone: 300, fiber: 300 });
  const restored = system.outposts.restore(state, outpost.id);
  assert.equal(restored.ok, true);
  assert.equal(outpost.status, 'ACTIVE');
  assert.equal(outpost.hp, outpost.maxHp);
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

test('enemy base capture boundary uses the shared capture-range constant', async () => {
  const { ENEMY_BASE_CAPTURE_RANGE_METERS } = await import('../src/combat/definitions.js');
  const state = stateWithWorld();
  state.world.enemyBases = [{ id: 'boundary-camp', type: 'barracks', nodeId: 'base', alive: true, captured: false, captureProgress: 0 }];
  const system = new CivilizationSystem();
  const baseNode = state.world.roadGraph.nodeById.get('base');
  state.player.worldPosition = { x: baseNode.x - ENEMY_BASE_CAPTURE_RANGE_METERS, y: baseNode.y };
  assert.equal(system.outposts.beginCapture(state, 'boundary-camp').ok, true);
  state.world.enemyBases[0].captureActive = false;
  state.player.worldPosition = { x: baseNode.x - ENEMY_BASE_CAPTURE_RANGE_METERS - 0.01, y: baseNode.y };
  assert.equal(system.outposts.beginCapture(state, 'boundary-camp').ok, false);
});
