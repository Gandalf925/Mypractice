import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';
import {
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchFriendlySquad,
  previewFriendlyDeployment
} from '../src/combat/friendly-force-system.js';
import {
  beginFriendlyRecovery,
  recoveryProfileForSquad,
  updateFriendlyRecovery
} from '../src/combat/friendly-recovery-system.js';
import { FRIENDLY_SQUAD_DEFINITIONS } from '../src/combat/friendly-force-definitions.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { CIVILIZATIONS, DEFENSE_LINES } from '../src/civilization/data.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture(level = 4) {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'home-site', x: 20, y: 0 },
      { id: 'field', x: 300, y: 0 },
      { id: 'field-site', x: 320, y: 0 },
      { id: 'enemy', x: 600, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'home-site', length: 20, roadWidth: 5 },
      { id: 'b', a: 'home-site', b: 'field', length: 280, roadWidth: 5 },
      { id: 'c', a: 'field', b: 'field-site', length: 20, roadWidth: 5 },
      { id: 'd', a: 'field-site', b: 'enemy', length: 280, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [{ id: 'field-base', kind: 'FIELD', name: '簡易拠点', status: 'ESTABLISHED', nodeId: 'field', x: 300, y: 0, hp: 40, maxHp: 40, establishedAt: 2 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1, spawnClock: 0, wavesSent: 0 }];
  state.civilization.level = level;
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  for (const key of Object.keys(state.inventory.resources)) state.inventory.resources[key] = 999;
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

function squad(type = 'assault', baseId = 'home-base', hpRatio = 0.25) {
  const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
  return {
    id: `${type}-${baseId}`, type, hp: definition.hp * hpRatio, maxHp: definition.hp, members: definition.members,
    originBaseId: baseId, targetBaseId: null, missionTargetBaseId: null,
    nodeId: baseId === 'field-base' ? 'field' : 'home', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.RETURNING, order: 'RETURN', commandDestinationNodeId: baseId === 'field-base' ? 'field' : 'home',
    travelHistoryNodeIds: [baseId === 'field-base' ? 'field' : 'home'], engagedEnemyId: null, combatCooldown: 0, departDelay: 0, deployedAt: 1
  };
}

function facility(type, baseId, nodeId, tier = 1) {
  return {
    id: `${type}-${baseId}`, type, kind: 'tower', line: type, tier, defenseKey: `${type}${tier}`,
    nodeId, baseId, buildAnchorId: baseId === 'field-base' ? `field:${baseId}` : 'base',
    hp: 170, maxHp: 170, ruined: false, disabledTimer: 0, cooldown: 0
  };
}


test('civilization level one unlocks treatment and field aid with the approved progression', () => {
  assert.ok(CIVILIZATIONS[1].unlocks.includes('medical1'));
  assert.ok(CIVILIZATIONS[1].unlocks.includes('fieldAid1'));
  assert.equal(DEFENSE_LINES.medical[1].recoveryRate, 0.012);
  assert.equal(DEFENSE_LINES.medical[4].recoveryRate, 0.027);
  assert.equal(DEFENSE_LINES.medical[4].reorganizationSeconds, 12);
  assert.equal(DEFENSE_LINES.fieldAid[1].recoveryCap, 0.7);
  assert.equal(DEFENSE_LINES.fieldAid[1].reorganizationSeconds, 45);
});

test('major bases recover a returned squad to full health and keep it ready for redeployment', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.25);
  state.combat.friendlySquads = [unit];
  assert.equal(beginFriendlyRecovery(state, unit, 'home-base').ok, true);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  for (let second = 0; second < 140; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, unit.maxHp);
});

test('a treatment facility accelerates healing and reorganization at a major base', () => {
  const baselineState = fixture();
  const baseline = squad('assault', 'home-base', 0.25);
  baselineState.combat.friendlySquads = [baseline];
  beginFriendlyRecovery(baselineState, baseline, 'home-base');
  for (let second = 0; second < 50; second += 1) updateFriendlyRecovery(baselineState, baseline, 1);
  assert.equal(baseline.status, FRIENDLY_SQUAD_STATUS.RECOVERING);

  const improvedState = fixture();
  improvedState.combat.defenses.push(facility('medical', 'home-base', 'home-site', 2));
  const improved = squad('assault', 'home-base', 0.25);
  improvedState.combat.friendlySquads = [improved];
  beginFriendlyRecovery(improvedState, improved, 'home-base');
  for (let second = 0; second < 50; second += 1) updateFriendlyRecovery(improvedState, improved, 1);
  assert.equal(improved.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(improved.hp, improved.maxHp);
});

test('a field base without an aid station reorganizes but does not heal a light squad', () => {
  const state = fixture();
  const unit = squad('assault', 'field-base', 0.3);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'field-base');
  const startingHp = unit.hp;
  for (let second = 0; second < 70; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, startingHp);
});

test('a field aid station heals assault and skirmisher squads up to seventy percent', () => {
  const state = fixture();
  state.combat.defenses.push(facility('fieldAid', 'field-base', 'field-site'));
  const unit = squad('skirmisher', 'field-base', 0.2);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'field-base');
  for (let second = 0; second < 90; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.ok(Math.abs(unit.hp - unit.maxHp * 0.7) < 0.01);
});

test('field aid does not heal non-light squads if legacy data places one at a field base', () => {
  const state = fixture();
  state.combat.defenses.push(facility('fieldAid', 'field-base', 'field-site'));
  const unit = squad('siege', 'field-base', 0.4);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'field-base');
  const startingHp = unit.hp;
  for (let second = 0; second < 100; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, startingHp);
});

test('a recovering squad occupies one slot while another free slot remains usable', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.5);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  const whileRecovering = previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base');
  assert.equal(whileRecovering.ok, true);
  assert.equal(whileRecovering.reuseReadySquad, false);
  assert.equal(whileRecovering.assignedSquads, 1);
  assert.equal(whileRecovering.capacity, 6);
  for (let second = 0; second < 140; second += 1) updateFriendlyRecovery(state, unit, 1);
  const before = { ...state.inventory.resources };
  const preview = previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base');
  assert.equal(preview.ok, true);
  assert.equal(preview.reuseReadySquad, true);
  assert.deepEqual(preview.cost, {});
  const result = dispatchFriendlySquad(state, 'assault', 'home-base', 'enemy-base');
  assert.equal(result.redeployed, true);
  assert.equal(result.squad.id, unit.id);
  assert.deepEqual(state.inventory.resources, before);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.OUTBOUND);
});

test('selecting a different type replaces a ready garrison only when every squad slot is occupied', () => {
  const state = fixture(2);
  const unit = squad('assault', 'home-base', 1);
  unit.status = FRIENDLY_SQUAD_STATUS.READY;
  const active = Array.from({ length: 3 }, (_, index) => ({
    ...squad('assault', 'home-base', 1),
    id: `active-${index}`,
    status: FRIENDLY_SQUAD_STATUS.OUTBOUND,
    order: 'ADVANCE'
  }));
  state.combat.friendlySquads = [unit, ...active];
  const beforeTimber = state.inventory.resources.timber;
  const result = dispatchFriendlySquad(state, 'siege', 'home-base', 'enemy-base');
  assert.equal(result.ok, true);
  assert.equal(result.replaced, true);
  assert.equal(state.combat.friendlySquads.length, 4);
  assert.equal(state.combat.friendlySquads.some(item => item.id === unit.id), false);
  assert.equal(state.combat.friendlySquads.some(item => item.type === 'siege'), true);
  assert.equal(state.inventory.resources.timber, beforeTimber - FRIENDLY_SQUAD_DEFINITIONS.siege.cost.timber);
});

test('medical and field aid facilities are restricted to their matching base types and one slot each', () => {
  const state = fixture(1);
  const system = new BuildSystem(null);
  const medicalSites = system.listBuildSites(state, 'medical');
  const fieldAidSites = system.listBuildSites(state, 'fieldAid');
  assert.ok(medicalSites.length > 0);
  assert.ok(medicalSites.every(site => site.anchorKind === 'MAJOR'));
  assert.ok(fieldAidSites.length > 0);
  assert.ok(fieldAidSites.every(site => site.anchorKind === 'FIELD'));
  assert.equal(system.buildCandidate(state, medicalSites[0]).ok, true);
  assert.equal(system.listBuildSites(state, 'medical').length, 0);
  assert.equal(system.buildCandidate(state, fieldAidSites[0]).ok, true);
  assert.equal(system.listBuildSites(state, 'fieldAid').length, 0);
});

test('destroying a treatment facility immediately falls back to natural base recovery', () => {
  const state = fixture();
  const medical = facility('medical', 'home-base', 'home-site', 4);
  state.combat.defenses.push(medical);
  const unit = squad('assault', 'home-base', 0.2);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  assert.equal(recoveryProfileForSquad(state, unit).facility.id, medical.id);
  medical.hp = 0;
  medical.ruined = true;
  const fallback = recoveryProfileForSquad(state, unit);
  assert.equal(fallback.facility, null);
  assert.equal(fallback.label, '拠点療養');
});

test('recovery state and progress survive save and restore', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.35);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  updateFriendlyRecovery(state, unit, 20);
  const repository = new SaveRepository(new MemoryStorage(), 'friendly-recovery');
  repository.save(state);
  const restored = repository.load();
  const restoredUnit = restored.combat.friendlySquads[0];
  assert.equal(restoredUnit.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  assert.equal(restoredUnit.recoveryBaseId, 'home-base');
  assert.ok(restoredUnit.hp > FRIENDLY_SQUAD_DEFINITIONS.assault.hp * 0.35);
  assert.ok(restoredUnit.reorganizationRemaining < 45);
});

test('a recovering squad evacuates to the nearest major base when its field base is destroyed', () => {
  const state = fixture();
  const unit = squad('assault', 'field-base', 0.3);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'field-base');
  state.world.fieldBases[0].hp = 0;
  state.world.fieldBases[0].status = 'DESTROYED';
  const system = new FriendlyForceSystem();
  const spatial = { query() { return []; } };
  system.update(state, 1, spatial);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.RETURNING);
  assert.equal(unit.originBaseId, 'home-base');
  assert.equal(unit.recoveryBaseId, 'home-base');
  assert.equal(unit.path.targetId, 'home');
  for (let second = 0; second < 420; second += 1) system.update(state, 1, spatial);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, unit.maxHp);
});

test('recovery and ready garrisons reject tactical movement orders', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.5);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  const system = new FriendlyForceSystem();
  assert.equal(system.hold(state, unit.id).ok, false);
  assert.equal(system.issueRouteOrder(state, unit.id, {
    order: 'ADVANCE', destinationNodeId: 'enemy',
    path: { nodeIds: ['home', 'home-site', 'field', 'field-site', 'enemy'], edgeIds: ['a', 'b', 'c', 'd'], targetId: 'enemy', cost: 600 }
  }).ok, false);
  unit.status = FRIENDLY_SQUAD_STATUS.READY;
  assert.equal(system.hold(state, unit.id).ok, false);
});

test('treatment capacity queues excess squads without losing recovery state', () => {
  const state = fixture();
  state.combat.defenses.push(facility('medical', 'home-base', 'home-site', 1));
  const first = squad('assault', 'home-base', 0.5);
  first.id = 'first';
  const second = squad('skirmisher', 'home-base', 0.5);
  second.id = 'second';
  state.combat.friendlySquads = [first, second];
  beginFriendlyRecovery(state, first, 'home-base', 1000);
  beginFriendlyRecovery(state, second, 'home-base', 2000);
  const secondRemaining = second.reorganizationRemaining;
  assert.equal(updateFriendlyRecovery(state, first, 1).updated, true);
  const queued = updateFriendlyRecovery(state, second, 1);
  assert.equal(queued.queued, true);
  assert.equal(second.reorganizationRemaining, secondRemaining);
  assert.equal(second.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
});

test('tier-three treatment facilities process two recovering squads at once', () => {
  const state = fixture(3);
  state.combat.defenses.push(facility('medical', 'home-base', 'home-site', 3));
  const first = squad('assault', 'home-base', 0.5);
  first.id = 'first';
  const second = squad('skirmisher', 'home-base', 0.5);
  second.id = 'second';
  state.combat.friendlySquads = [first, second];
  beginFriendlyRecovery(state, first, 'home-base', 1000);
  beginFriendlyRecovery(state, second, 'home-base', 2000);
  const beforeFirst = first.reorganizationRemaining;
  const beforeSecond = second.reorganizationRemaining;
  updateFriendlyRecovery(state, first, 1);
  updateFriendlyRecovery(state, second, 1);
  assert.ok(first.reorganizationRemaining < beforeFirst);
  assert.ok(second.reorganizationRemaining < beforeSecond);
});
