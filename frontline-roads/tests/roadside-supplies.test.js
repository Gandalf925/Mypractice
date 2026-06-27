import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureInventoryState } from '../src/civilization/inventory-system.js';
import { FriendlyForceSystem, FRIENDLY_SQUAD_STATUS } from '../src/combat/friendly-force-system.js';
import {
  collectNearbyRoadsideSupplies,
  ensureRoadsideSupplyState,
  refreshRoadsideSupplies,
  useBreachCharge,
  useLocalDeploymentCall,
  useMarchBanner,
  useRoadMine,
  useSmokeScreen,
  useLureSignal,
  updateRoadsideMines,
  useSweepSignal
} from '../src/exploration/roadside-supplies.js';

function makeGraph() {
  const nodes = [
    { id: 'n0', x: 0, y: 0, chunkIds: ['0:0'] },
    { id: 'n1', x: 100, y: 0, chunkIds: ['0:0'] },
    { id: 'n2', x: 220, y: 0, chunkIds: ['0:0'] },
    { id: 'n3', x: 320, y: 0, chunkIds: ['0:0'] }
  ];
  const edges = [
    { id: 'e0', a: 'n0', b: 'n1', length: 100, chunkIds: ['0:0'] },
    { id: 'e1', a: 'n1', b: 'n2', length: 120, chunkIds: ['0:0'] },
    { id: 'e2', a: 'n2', b: 'n3', length: 100, chunkIds: ['0:0'] }
  ];
  const graph = { nodes, edges, center: { lat: 35, lon: 139 } };
  attachGraphIndexes(graph);
  return graph;
}

function makeState() {
  const state = createInitialState();
  state.world.roadGraph = makeGraph();
  state.world.homeBase = { id: 'home', status: 'ESTABLISHED', nodeId: 'n0', x: 0, y: 0, hp: 100, maxHp: 100, primary: true, name: '本拠地' };
  state.world.playerBases = [state.world.homeBase];
  state.world.city = { nodeId: 'n0', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 100, y: 0 };
  state.player.locationUpdatedAt = Date.now();
  state.player.locationAccuracy = 20;
  state.runtime.worldTimeMs = Date.now();
  ensureInventoryState(state, { initialize: true });
  ensureRoadsideSupplyState(state);
  return state;
}

test('roadside supplies initialize and generated items can be collected', () => {
  const state = makeState();
  const supplies = ensureRoadsideSupplyState(state);
  supplies.active = [{ id: 'manual-resource', kind: 'resource', type: 'wood_crate', name: '木材箱', rarity: 'common', bundle: { wood: 7 }, x: 100, y: 0 }];
  const before = state.inventory.resources.wood;
  const collected = collectNearbyRoadsideSupplies(state);
  assert.equal(collected.length, 1);
  assert.equal(state.inventory.resources.wood, before + 7);
  assert.ok(state.world.roadsideSupplies.collectedIds.includes('manual-resource'));
});

test('sweep signal removes nearby normal enemies without a target button', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.sweepSignal = 1;
  state.combat.enemies = [
    { id: 'enemy-near', type: 'infantry', hp: 20, maxHp: 20, nodeId: 'n1', edgeId: null, edgeProgress: 0, path: null, pathIndex: 0, departDelay: 0, rewardGranted: false },
    { id: 'enemy-far', type: 'infantry', hp: 20, maxHp: 20, nodeId: 'n3', edgeId: null, edgeProgress: 0, path: null, pathIndex: 0, departDelay: 0, rewardGranted: false }
  ];
  const result = useSweepSignal(state);
  assert.equal(result.ok, true);
  assert.equal(result.killed, 1);
  assert.equal(state.world.roadsideSupplies.inventory.sweepSignal, 0);
  assert.deepEqual(state.combat.enemies.map(enemy => enemy.id), ['enemy-far']);
});

test('breach charge destroys the nearest enemy base through existing base destruction flow', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.breachCharge = 1;
  state.world.enemyBases = [{ id: 'base-near', type: 'barracks', alive: true, destroyed: false, nodeId: 'n1', hp: 60, maxHp: 60, level: 1, wavesSent: 0 }];
  const result = useBreachCharge(state);
  assert.equal(result.ok, true);
  assert.equal(state.world.enemyBases[0].alive, false);
  assert.equal(state.world.enemyBases[0].destroyed, true);
  assert.equal(state.world.roadsideSupplies.inventory.breachCharge, 0);
  assert.equal(state.world.recoveryItems.length, 1);
});

test('local deployment call creates one temporary squad from current road position', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.assaultCall = 1;
  state.world.enemyBases = [{ id: 'base-target', type: 'barracks', alive: true, destroyed: false, nodeId: 'n3', hp: 120, maxHp: 120, level: 1, wavesSent: 0 }];
  const result = useLocalDeploymentCall(state, 'assaultCall');
  assert.equal(result.ok, true);
  assert.equal(state.world.roadsideSupplies.inventory.assaultCall, 0);
  assert.equal(state.combat.friendlySquads.length, 1);
  const squad = state.combat.friendlySquads[0];
  assert.equal(squad.temporaryDeployment.itemKey, 'assaultCall');
  assert.equal(squad.nodeId, 'n1');
  assert.equal(squad.missionTargetBaseId, 'base-target');
  assert.ok(squad.path.edgeIds.length > 0);
});

test('refresh keeps generated roadside supplies bounded', () => {
  const state = makeState();
  const active = refreshRoadsideSupplies(state, true);
  assert.ok(Array.isArray(active));
  assert.ok(active.length <= 48);
  for (const item of active) {
    assert.ok(Number.isFinite(item.x));
    assert.ok(Number.isFinite(item.y));
  }
});


test('road mine is placed on the current road and detonates when enemies pass', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.roadMine = 1;
  const placed = useRoadMine(state);
  assert.equal(placed.ok, true);
  assert.equal(state.world.roadsideSupplies.inventory.roadMine, 0);
  assert.equal(state.world.roadsideSupplies.placedMines.length, 1);
  state.combat.enemies = [{ id: 'mine-target', type: 'infantry', hp: 35, maxHp: 35, nodeId: 'n1', edgeId: null, edgeProgress: 0, path: null, pathIndex: 0, departDelay: 0, rewardGranted: false }];
  const result = updateRoadsideMines(state);
  assert.equal(result.detonated, 1);
  assert.equal(state.combat.enemies.length, 0);
  assert.equal(state.world.roadsideSupplies.placedMines.length, 0);
});

test('lure signal marks nearby enemies for temporary reroute', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.lureSignal = 1;
  state.combat.enemies = [{ id: 'lured', type: 'infantry', hp: 35, maxHp: 35, nodeId: 'n2', edgeId: null, edgeProgress: 0, path: null, pathIndex: 0, departDelay: 0, rewardGranted: false }];
  const result = useLureSignal(state);
  assert.equal(result.ok, true);
  assert.equal(result.affected, 1);
  assert.equal(state.combat.enemies[0].roadsideLureNodeId, 'n1');
  assert.ok(state.combat.enemies[0].roadsideLureUntil > state.runtime.worldTimeMs);
});

test('march banner applies a temporary speed boost to nearby friendly squads', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.marchBanner = 1;
  state.combat.friendlySquads = [{
    id: 'squad-boost', type: 'assault', hp: 100, maxHp: 180, originBaseId: 'home', nodeId: 'n1', edgeId: 'e1', edgeProgress: 10,
    path: { nodeIds: ['n1', 'n2'], edgeIds: ['e1'], cost: 120, targetId: 'n2' }, pathIndex: 0, status: 'OUTBOUND', order: 'ADVANCE'
  }];
  const result = useMarchBanner(state);
  assert.equal(result.ok, true);
  assert.equal(result.squads.length, 1);
  assert.equal(state.world.roadsideSupplies.inventory.marchBanner, 0);
  assert.ok(state.combat.friendlySquads[0].roadsideSpeedBoostUntil > state.runtime.worldTimeMs);
});

test('smoke screen forces a nearby normal squad to withdraw instead of being left to annihilation', () => {
  const state = makeState();
  state.world.roadsideSupplies.inventory.smokeScreen = 1;
  state.combat.friendlySquads = [{
    id: 'squad-smoke', type: 'assault', hp: 40, maxHp: 180, originBaseId: 'home', nodeId: 'n1', edgeId: null, edgeProgress: 0,
    path: null, pathIndex: 0, status: 'ENGAGED', order: 'ADVANCE', engagedEnemyId: 'enemy-close'
  }];
  state.combat.enemies = [{ id: 'enemy-close', type: 'infantry', hp: 35, maxHp: 35, nodeId: 'n1', edgeId: null, edgeProgress: 0, path: null, pathIndex: 0, departDelay: 0, engagedSquadId: 'squad-smoke', rewardGranted: false }];
  const result = useSmokeScreen(state);
  assert.equal(result.ok, true);
  assert.equal(state.combat.friendlySquads[0].status, FRIENDLY_SQUAD_STATUS.WITHDRAWING);
  assert.equal(state.combat.friendlySquads[0].order, 'WITHDRAW');
  assert.equal(state.combat.enemies[0].engagedSquadId, null);
});

test('annihilated non-temporary squads enter long recovery and keep occupying the squad slot', () => {
  const state = makeState();
  state.combat.friendlySquads = [{
    id: 'squad-lost', type: 'siege', hp: 0, maxHp: 150, originBaseId: 'home', nodeId: 'n1', edgeId: null, edgeProgress: 0,
    path: null, pathIndex: 0, status: 'ENGAGED', order: 'ADVANCE', engagedEnemyId: null
  }];
  new FriendlyForceSystem().update(state, 1, { query: () => [] });
  assert.equal(state.combat.friendlySquads.length, 1);
  const squad = state.combat.friendlySquads[0];
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  assert.equal(squad.annihilatedRecovery, true);
  assert.ok(squad.hp > 0);
  assert.ok(squad.reorganizationRemaining >= 420);
});
