import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FRIENDLY_SQUAD_ORDER,
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchAssaultSquad,
  friendlySquadPosition,
  holdFriendlySquad,
  issueFriendlyRouteOrder
} from '../src/combat/friendly-force-system.js';
import {
  buildFriendlyRouteOptions,
  commandStartNodeId,
  friendlyRouteIndexAtPoint,
  validateRetreatDestination
} from '../src/combat/friendly-route-planner.js';
import { SaveRepository } from '../src/persistence/save-repository.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function emptySpatial() {
  return { query: () => [], positions: new Map(), commanders: [] };
}

function linearState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'a', x: 100, y: 0 },
      { id: 'enemy', x: 200, y: 0 }
    ],
    edges: [
      { id: 'home-a', a: 'home', b: 'a', length: 100, roadWidth: 5 },
      { id: 'a-enemy', a: 'a', b: 'enemy', length: 100, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1 }];
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

function branchingState() {
  const state = linearState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'a', x: 100, y: 0 },
      { id: 'lower', x: 150, y: -80 },
      { id: 'upper', x: 150, y: 80 },
      { id: 'b', x: 200, y: 0 },
      { id: 'enemy', x: 300, y: 0 }
    ],
    edges: [
      { id: 'home-a', a: 'home', b: 'a', length: 100, roadWidth: 5 },
      { id: 'a-b', a: 'a', b: 'b', length: 100, roadWidth: 5 },
      { id: 'a-lower', a: 'a', b: 'lower', length: 95, roadWidth: 5 },
      { id: 'lower-b', a: 'lower', b: 'b', length: 95, roadWidth: 5 },
      { id: 'a-upper', a: 'a', b: 'upper', length: 95, roadWidth: 5 },
      { id: 'upper-b', a: 'upper', b: 'b', length: 95, roadWidth: 5 },
      { id: 'b-enemy', a: 'b', b: 'enemy', length: 100, roadWidth: 5 }
    ]
  });
  state.world.enemyBases[0].nodeId = 'enemy';
  state.combat.enemies = [{
    id: 'visible-enemy', type: 'infantry', level: 2, hp: 50, maxHp: 50,
    nodeId: 'lower', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    departDelay: 0, slowTimer: 0, sourceBaseId: 'enemy-base'
  }];
  state.combat.defenses = [{
    id: 'support', kind: 'tower', type: 'gun', nodeId: 'upper', hp: 100, maxHp: 100,
    range: 90, tier: 0, cooldown: 0, disabledTimer: 0
  }];
  return state;
}

function dispatchedAtA(state) {
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'a';
  squad.path = { nodeIds: ['a', 'enemy'], edgeIds: ['a-enemy'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = 'a-enemy';
  squad.edgeProgress = 0;
  squad.travelHistoryNodeIds = ['home', 'a'];
  return squad;
}

test('stop holds a squad at its exact road position while retaining the mission', () => {
  const state = linearState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.edgeProgress = 35;
  const before = friendlySquadPosition(state, squad);
  assert.equal(holdFriendlySquad(state, squad.id).ok, true);
  new FriendlyForceSystem().update(state, 20, emptySpatial());
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.HOLD);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.HALTED);
  assert.deepEqual(friendlySquadPosition(state, squad), before);
  assert.equal(squad.missionTargetBaseId, 'enemy-base');
});

test('route command issued mid-edge preserves position and joins the chosen route at the next intersection', () => {
  const state = linearState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.edgeProgress = 40;
  const before = friendlySquadPosition(state, squad);
  assert.equal(commandStartNodeId(state, squad), 'a');
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(friendlySquadPosition(state, squad), before);
  assert.deepEqual(squad.path.nodeIds, ['home', 'a', 'home']);
  assert.equal(squad.edgeProgress, 40);
});

test('retreat reaches the selected node, stops there, and keeps the original attack mission', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, true);
  const system = new FriendlyForceSystem();
  for (let index = 0; index < 100; index += 1) system.update(state, 1, emptySpatial());
  assert.equal(squad.nodeId, 'home');
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.HOLD);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.HALTED);
  assert.equal(squad.missionTargetBaseId, 'enemy-base');
});

test('withdraw abandons the mission and begins recovery only after it reaches the origin', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.WITHDRAW,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, true);
  assert.equal(squad.missionTargetBaseId, null);
  assert.equal(squad.targetBaseId, null);
  const system = new FriendlyForceSystem();
  system.update(state, 20, emptySpatial());
  assert.equal(state.combat.friendlySquads.length, 1);
  for (let index = 0; index < 80; index += 1) system.update(state, 1, emptySpatial());
  assert.equal(state.combat.friendlySquads.length, 1);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  assert.equal(squad.recoveryBaseId, 'home-base');
});

test('stopping a retreat preserves the retreat destination for route-selected resume', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  holdFriendlySquad(state, squad.id);
  assert.equal(squad.heldOrder, FRIENDLY_SQUAD_ORDER.RETREAT);
  assert.equal(squad.heldDestinationNodeId, 'home');
});

test('retreat validation rejects a node closer to the hostile base and accepts an owned base behind the squad', () => {
  const state = branchingState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'b';
  squad.path = { nodeIds: ['b', 'enemy'], edgeIds: ['b-enemy'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  assert.equal(validateRetreatDestination(state, squad, 'enemy').ok, false);
  assert.equal(validateRetreatDestination(state, squad, 'home').ok, true);
});

test('route planner exposes distinct shortest, enemy-avoidance and friendly-support choices when the road graph allows them', () => {
  const state = branchingState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'b';
  squad.path = { nodeIds: ['b', 'enemy'], edgeIds: ['b-enemy'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  const options = buildFriendlyRouteOptions(state, squad, 'home');
  assert.ok(options.length >= 2);
  assert.equal(options[0].label, '最短');
  assert.equal(new Set(options.map(option => option.path.edgeIds.join('|'))).size, options.length);
  assert.ok(options.every(option => option.path.nodeIds[0] === 'b' && option.path.targetId === 'home'));
});

test('waypoints force every generated route through the selected intersections', () => {
  const state = branchingState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'b';
  squad.path = { nodeIds: ['b', 'enemy'], edgeIds: ['b-enemy'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  const options = buildFriendlyRouteOptions(state, squad, 'home', ['upper']);
  assert.ok(options.length > 0);
  assert.ok(options.every(option => option.path.nodeIds.includes('upper')));
});


test('retreating through a newly encountered enemy does not grant invulnerability', async () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  state.combat.enemies.push({
    id: 'road-blocker', type: 'infantry', level: 1, hp: 50, maxHp: 50,
    nodeId: 'a', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    departDelay: 0, slowTimer: 0, sourceBaseId: 'enemy-base', engagedSquadId: null
  });
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, true);
  const { CombatSystem } = await import('../src/combat/combat-system.js');
  const before = squad.hp;
  new CombatSystem(null).update(state, 1);
  assert.ok(squad.hp < before);
  assert.ok(squad.edgeProgress > 0);
});

test('friendly orders, selected route and history survive save and restore', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['home-a'], targetId: 'home', cost: 100 }
  });
  holdFriendlySquad(state, squad.id);
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'orders-test');
  repository.save(state);
  const restored = repository.load();
  const loaded = restored.combat.friendlySquads[0];
  assert.equal(loaded.order, FRIENDLY_SQUAD_ORDER.HOLD);
  assert.equal(loaded.heldOrder, FRIENDLY_SQUAD_ORDER.RETREAT);
  assert.equal(loaded.heldDestinationNodeId, 'home');
  assert.deepEqual(loaded.travelHistoryNodeIds, ['home', 'a']);
});

test('a rejected withdraw route leaves the original mission untouched', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.WITHDRAW,
    destinationNodeId: 'home',
    path: { nodeIds: ['enemy', 'a'], edgeIds: ['a-enemy'], targetId: 'a', cost: 100 }
  });
  assert.equal(result.ok, false);
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.ADVANCE);
  assert.equal(squad.targetBaseId, 'enemy-base');
  assert.equal(squad.missionTargetBaseId, 'enemy-base');
});

test('route orders reject paths whose edges do not connect the declared node sequence', () => {
  const state = linearState();
  const squad = dispatchedAtA(state);
  const result = issueFriendlyRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.RETREAT,
    destinationNodeId: 'home',
    path: { nodeIds: ['a', 'home'], edgeIds: ['a-enemy'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, false);
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.ADVANCE);
});


test('route estimates include the remaining distance on the squad current road segment', () => {
  const state = linearState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.edgeProgress = 40;
  const options = buildFriendlyRouteOptions(state, squad, 'home');
  assert.ok(options.length > 0);
  assert.equal(Math.round(options[0].physicalDistance), 160);
  assert.equal(Math.round(options[0].etaSeconds), 128);
});

test('a map tap near a displayed route selects that route instead of becoming a waypoint', () => {
  const state = branchingState();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'b';
  squad.path = { nodeIds: ['b', 'enemy'], edgeIds: ['b-enemy'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  const options = buildFriendlyRouteOptions(state, squad, 'home');
  assert.ok(options.length >= 2);
  const selected = friendlyRouteIndexAtPoint(state, squad, options, { x: 150, y: -80 }, 15);
  assert.ok(selected >= 0);
  assert.ok(options[selected].path.nodeIds.includes('lower'));
});
