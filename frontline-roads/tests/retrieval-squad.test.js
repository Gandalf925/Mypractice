import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS,
  FRIENDLY_SQUAD_ORDER,
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchFriendlySquad,
  friendlySquadPosition,
  previewFriendlyDeployment
} from '../src/combat/friendly-force-system.js';
import { FIELD_BASE_ALLOWED_SQUAD_TYPES } from '../src/base/field-bases.js';
import { FIELD_RECOVERY_SQUAD_TYPES } from '../src/combat/friendly-recovery-system.js';
import {
  RECOVERY_ITEM_STATUS,
  RecoverySystem,
  ensureRecoveryState,
  recoveryEligibility
} from '../src/exploration/recovery-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { EnemySystem } from '../src/combat/enemy-system.js';
import { buildCombatSpatialIndex } from '../src/combat/combat-spatial-index.js';
import { consumeRegionalSimulationTime, regionActivityAtPoint } from '../src/combat/region-activity.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture({ field = false, remote = false } = {}) {
  const state = createInitialState();
  const middleX = remote ? 1500 : 100;
  const itemX = remote ? 3000 : 200;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'middle', x: middleX, y: 0 },
      { id: 'item-node', x: itemX, y: 0 }
    ],
    edges: [
      { id: 'road-a', a: 'home', b: 'middle', length: middleX, roadWidth: 5 },
      { id: 'road-b', a: 'middle', b: 'item-node', length: itemX - middleX, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, kind: 'MAJOR', name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = field ? [{ id: 'field-base', kind: 'FIELD', name: '簡易拠点', status: 'ESTABLISHED', nodeId: 'middle', x: middleX, y: 0, hp: 40, maxHp: 40, establishedAt: 2 }] : [];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [];
  state.world.recoveryItems = [{
    id: 'artifact', sourceBaseId: 'destroyed-base', sourceBaseType: 'barracks', nodeId: 'item-node',
    x: itemX, y: 0, artifactType: 'commandSeal', amount: 1, status: RECOVERY_ITEM_STATUS.AVAILABLE,
    assignedSquadId: null, droppedAt: 1
  }];
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  for (const key of Object.keys(state.inventory.resources)) state.inventory.resources[key] = 999;
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

const emptySpatial = { query() { return []; }, positions: new Map() };

function advanceUntil(system, state, predicate, maxSeconds = 1000) {
  for (let second = 0; second < maxSeconds; second += 1) {
    system.update(state, 1, emptySpatial);
    if (predicate()) return second + 1;
  }
  return null;
}

test('retrieval squad is deliberately weak and works from major and field bases', () => {
  const definition = FRIENDLY_SQUAD_DEFINITIONS.retrieval;
  assert.equal(definition.unlockLevel, 0);
  assert.equal(definition.missionKind, 'RECOVERY');
  assert.ok(definition.hp < FRIENDLY_SQUAD_DEFINITIONS.skirmisher.hp);
  assert.ok(definition.enemyDps < FRIENDLY_SQUAD_DEFINITIONS.assault.enemyDps);
  assert.equal(definition.baseDps, 0);
  assert.ok(FIELD_BASE_ALLOWED_SQUAD_TYPES.includes('retrieval'));
  assert.ok(FIELD_RECOVERY_SQUAD_TYPES.includes('retrieval'));
});

test('dispatch reserves a recovery item and preview does not mutate it', () => {
  const state = fixture();
  const before = { ...state.inventory.resources };
  const preview = previewFriendlyDeployment(state, 'retrieval', 'home-base', 'artifact');
  assert.equal(preview.ok, true);
  assert.equal(preview.missionType, 'RECOVERY');
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.deepEqual(state.inventory.resources, before);
  const result = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact');
  assert.equal(result.ok, true);
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.RESERVED);
  assert.equal(state.world.recoveryItems[0].assignedSquadId, result.squad.id);
  assert.equal(recoveryEligibility(state, state.world.recoveryItems[0]).ok, false);
  assert.equal(new RecoverySystem().beginCollection(state, 'artifact').ok, false);
});

test('retrieval squad collects for eight seconds and grants the artifact only after returning', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  const system = new FriendlyForceSystem();
  assert.ok(advanceUntil(system, state, () => squad.status === FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM));
  system.update(state, 7, emptySpatial);
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.RESERVED);
  assert.equal(state.civilization.totalArtifactsRecovered, 0);
  system.update(state, 1, emptySpatial);
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.CARRIED);
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.RETURN);
  assert.equal(state.civilization.totalArtifactsRecovered, 0);
  assert.ok(advanceUntil(system, state, () => squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING));
  assert.equal(state.world.recoveryItems.length, 0);
  assert.equal(state.civilization.artifacts.commandSeal, 1);
  assert.equal(state.civilization.totalArtifactsRecovered, 1);
});

test('destroying a squad before pickup releases the item at its original location', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  const original = { x: state.world.recoveryItems[0].x, y: state.world.recoveryItems[0].y, nodeId: state.world.recoveryItems[0].nodeId };
  squad.hp = 0;
  new FriendlyForceSystem().update(state, 1, emptySpatial);
  const item = state.world.recoveryItems[0];
  assert.equal(item.status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(item.assignedSquadId, null);
  assert.deepEqual({ x: item.x, y: item.y, nodeId: item.nodeId }, original);
  assert.equal(state.combat.friendlySquads.length, 0);
});

test('destroying a squad while carrying drops the item at the destruction point', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  const system = new FriendlyForceSystem();
  assert.ok(advanceUntil(system, state, () => state.world.recoveryItems[0].status === RECOVERY_ITEM_STATUS.CARRIED));
  squad.nodeId = 'middle';
  squad.path = { nodeIds: ['item-node', 'middle', 'home'], edgeIds: ['road-b', 'road-a'], targetId: 'home', cost: 200 };
  squad.pathIndex = 0;
  squad.edgeId = 'road-b';
  squad.edgeProgress = 50;
  squad.hp = 0;
  system.update(state, 1, emptySpatial);
  const item = state.world.recoveryItems[0];
  assert.equal(item.status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(item.assignedSquadId, null);
  assert.ok(item.x < 200 && item.x > 100);
  assert.equal(item.nodeId, 'middle');
});

test('withdrawing before pickup abandons the recovery mission and releases the item', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  squad.nodeId = 'middle';
  squad.path = { nodeIds: ['middle', 'item-node'], edgeIds: ['road-b'], targetId: 'item-node', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = 'road-b';
  squad.edgeProgress = 0;
  const system = new FriendlyForceSystem();
  const result = system.issueRouteOrder(state, squad.id, {
    order: FRIENDLY_SQUAD_ORDER.WITHDRAW,
    destinationNodeId: 'home',
    path: { nodeIds: ['middle', 'home'], edgeIds: ['road-a'], targetId: 'home', cost: 100 }
  });
  assert.equal(result.ok, true);
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(squad.targetRecoveryItemId, null);
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.WITHDRAW);
});

test('field bases can deploy and reorganize retrieval squads', () => {
  const state = fixture({ field: true });
  const result = dispatchFriendlySquad(state, 'retrieval', 'field-base', 'artifact');
  assert.equal(result.ok, true);
  assert.equal(result.squad.originBaseId, 'field-base');
  result.squad.hp = 20;
  result.squad.order = FRIENDLY_SQUAD_ORDER.RETURN;
  result.squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  result.squad.nodeId = 'middle';
  result.squad.path = { nodeIds: ['middle'], edgeIds: [], targetId: 'middle', cost: 0 };
  result.squad.edgeId = null;
  releaseReservation(state, result.squad);
  new FriendlyForceSystem().update(state, 1, emptySpatial);
  assert.equal(result.squad.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
});

function releaseReservation(state, squad) {
  const item = state.world.recoveryItems.find(value => value.assignedSquadId === squad.id);
  if (item) { item.status = RECOVERY_ITEM_STATUS.AVAILABLE; item.assignedSquadId = null; }
  squad.targetRecoveryItemId = null;
}

test('reserved recovery mission survives save and restore without exposing exact live location data', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  const repository = new SaveRepository(new MemoryStorage(), 'retrieval-save');
  repository.save(state);
  const restored = repository.load();
  const item = ensureRecoveryState(restored).find(value => value.id === 'artifact');
  assert.equal(restored.combat.friendlySquads[0].id, squad.id);
  assert.equal(restored.combat.friendlySquads[0].missionType, 'RECOVERY');
  assert.equal(restored.combat.friendlySquads[0].targetRecoveryItemId, 'artifact');
  assert.equal(item.status, RECOVERY_ITEM_STATUS.RESERVED);
  assert.equal(item.assignedSquadId, squad.id);
});


test('manual collection in progress blocks deployment without consuming resources or changing a ready squad', () => {
  const state = fixture();
  state.player.worldPosition = { x: 200, y: 0 };
  state.player.locationUpdatedAt = Date.now();
  state.player.locationAccuracy = 10;
  assert.equal(new RecoverySystem().beginCollection(state, 'artifact').ok, true);
  const ready = {
    id: 'ready-retrieval', type: 'retrieval', hp: 55, maxHp: 55, members: 3,
    originBaseId: 'home-base', nodeId: 'home', status: FRIENDLY_SQUAD_STATUS.READY,
    order: FRIENDLY_SQUAD_ORDER.HOLD, missionType: 'RECOVERY'
  };
  state.combat.friendlySquads.push(ready);
  const beforeResources = { ...state.inventory.resources };
  const beforeSquad = { id: ready.id, status: ready.status, order: ready.order, hp: ready.hp, nodeId: ready.nodeId, missionType: ready.missionType };
  const preview = previewFriendlyDeployment(state, 'retrieval', 'home-base', 'artifact');
  assert.equal(preview.ok, false);
  const result = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact');
  assert.equal(result.ok, false);
  assert.deepEqual(state.inventory.resources, beforeResources);
  const afterSquad = state.combat.friendlySquads[0];
  assert.deepEqual(
    { id: afterSquad.id, status: afterSquad.status, order: afterSquad.order, hp: afterSquad.hp, nodeId: afterSquad.nodeId, missionType: afterSquad.missionType },
    beforeSquad
  );
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(state.world.recoveryItems[0].assignedSquadId, null);
});

test('orphaned reservations become available again after squad data is lost', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  assert.equal(state.world.recoveryItems[0].assignedSquadId, squad.id);
  state.combat.friendlySquads = [];
  const item = ensureRecoveryState(state)[0];
  assert.equal(item.status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(item.assignedSquadId, null);
});

test('a real heavy enemy quickly destroys the weak retrieval squad and releases its reservation', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  squad.nodeId = 'middle';
  squad.path = { nodeIds: ['middle', 'item-node'], edgeIds: ['road-b'], targetId: 'item-node', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = 'road-b';
  squad.edgeProgress = 0;
  const enemy = {
    id: 'heavy-contact', type: 'heavy', level: 1, hp: 999, maxHp: 999, nodeId: 'middle',
    path: null, pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 0.52,
    attackClock: 0, departDelay: 0, sourceBaseId: 'enemy-source', waveId: null, waveResolved: false,
    rewardGranted: false, reroutePending: false, routeBias: 1, targetDefenseId: null,
    targetFieldBaseId: null, notifiedDefenseIds: [], engagedSquadId: squad.id
  };
  state.combat.enemies.push(enemy);
  const enemySystem = new EnemySystem();
  for (let second = 0; second < 20 && squad.hp > 0; second += 1) {
    enemySystem.update(state, 1, buildCombatSpatialIndex(state));
  }
  assert.equal(squad.hp, 0);
  new FriendlyForceSystem().update(state, 1, buildCombatSpatialIndex(state));
  assert.equal(state.combat.friendlySquads.length, 0);
  assert.equal(state.world.recoveryItems[0].status, RECOVERY_ITEM_STATUS.AVAILABLE);
  assert.equal(state.world.recoveryItems[0].assignedSquadId, null);
});

test('remote retrieval completes under active, peripheral, and dormant regional intervals', () => {
  const state = fixture({ remote: true });
  const squad = dispatchFriendlySquad(state, 'retrieval', 'home-base', 'artifact').squad;
  const system = new FriendlyForceSystem();
  let sawPeripheral = false;
  let sawDormant = false;
  for (let second = 0; second < 6500 && squad.status !== FRIENDLY_SQUAD_STATUS.RECOVERING; second += 1) {
    const due = consumeRegionalSimulationTime(state, 1);
    const activity = regionActivityAtPoint(state, friendlySquadPosition(state, squad));
    sawPeripheral ||= activity === 'PERIPHERAL';
    sawDormant ||= activity === 'DORMANT';
    const elapsed = activity === 'ACTIVE' ? due.active : activity === 'PERIPHERAL' ? due.peripheral : due.dormant;
    if (elapsed > 0) system.update(state, elapsed, emptySpatial);
  }
  assert.equal(sawPeripheral, true);
  assert.equal(sawDormant, true);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  assert.equal(state.world.recoveryItems.length, 0);
  assert.equal(state.civilization.totalArtifactsRecovered, 1);
});
