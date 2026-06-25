import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { normalizeCombatState } from '../src/combat/combat-initializer.js';
import { DefenseSystem } from '../src/combat/defense-system.js';
import {
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchFriendlySquad,
  friendlySquadCapacityForBase,
  previewFriendlyDeployment
} from '../src/combat/friendly-force-system.js';
import {
  beginFriendlyRecovery,
  recoveryProfileForSquad,
  updateFriendlyRecovery
} from '../src/combat/friendly-recovery-system.js';
import { applyMedicalAreaHealing, medicalCoverageForSquad } from '../src/combat/friendly-healing-system.js';
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
      { id: 'enemy', x: 600, y: 0 },
      { id: 'remote', x: 1800, y: 0 },
      { id: 'remote-site', x: 1880, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'home-site', length: 20, roadWidth: 5 },
      { id: 'b', a: 'home-site', b: 'field', length: 280, roadWidth: 5 },
      { id: 'c', a: 'field', b: 'field-site', length: 20, roadWidth: 5 },
      { id: 'd', a: 'field-site', b: 'enemy', length: 280, roadWidth: 5 },
      { id: 'e', a: 'enemy', b: 'remote', length: 1200, roadWidth: 5 },
      { id: 'f', a: 'remote', b: 'remote-site', length: 80, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', kind: 'MAJOR', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
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

function squad(type = 'assault', baseId = 'home-base', hpRatio = 0.25, nodeId = null) {
  const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
  const baseNodeId = nodeId ?? (baseId === 'field-base' ? 'field' : 'home');
  return {
    id: `${type}-${baseId}-${baseNodeId}`, type, hp: definition.hp * hpRatio, maxHp: definition.hp, members: definition.members,
    originBaseId: baseId, targetBaseId: null, missionTargetBaseId: null,
    nodeId: baseNodeId, path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.RETURNING, order: 'RETURN', commandDestinationNodeId: baseNodeId,
    travelHistoryNodeIds: [baseNodeId], engagedEnemyId: null, combatCooldown: 0, departDelay: 0, deployedAt: 1
  };
}

function facility(type, baseId, nodeId, tier = 1, anchorId = null) {
  const line = type;
  const definition = DEFENSE_LINES[line][tier];
  return {
    id: `${type}-${baseId}-${nodeId}`, type, kind: 'tower', line, tier, defenseKey: `${line}${tier}`,
    nodeId, baseId, buildAnchorId: anchorId ?? (baseId === 'field-base' ? `field:${baseId}` : 'base'),
    hp: definition.hp, maxHp: definition.hp, disabledTimer: 0, cooldown: 0
  };
}

test('civilization level one unlocks one area recovery facility and a distinct field barracks', () => {
  assert.ok(CIVILIZATIONS[1].unlocks.includes('medical1'));
  assert.ok(CIVILIZATIONS[1].unlocks.includes('fieldBarracks1'));
  assert.equal(CIVILIZATIONS[1].unlocks.includes('fieldAid1'), false);
  assert.equal(DEFENSE_LINES.medical[1].range, 90);
  assert.equal(DEFENSE_LINES.medical[1].recoveryRate, 0.004);
  assert.equal(DEFENSE_LINES.medical[4].range, 170);
  assert.equal(DEFENSE_LINES.medical[4].recoveryRate, 0.01);
  assert.equal(DEFENSE_LINES.fieldBarracks[1].squadCapacityBonus, 1);
});

test('major-base logistics restore a returned squad while the area recovery facility remains a separate field effect', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.25);
  state.combat.friendlySquads = [unit];
  assert.equal(beginFriendlyRecovery(state, unit, 'home-base').ok, true);
  for (let second = 0; second < 130; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, unit.maxHp);
  const profile = recoveryProfileForSquad(state, unit);
  assert.equal(profile.label, '主要拠点で補給・再編成');
  assert.equal(profile.healRatioPerSecond, 0.006);
});

test('a field base reorganizes squads without providing innate healing', () => {
  const state = fixture();
  const unit = squad('assault', 'field-base', 0.25);
  state.combat.friendlySquads = [unit];
  const startingHp = unit.hp;
  assert.equal(beginFriendlyRecovery(state, unit, 'field-base').ok, true);
  for (let second = 0; second < 65; second += 1) updateFriendlyRecovery(state, unit, 1);
  assert.equal(unit.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(unit.hp, startingHp);
});

test('a recovery facility gradually heals every friendly squad inside its radius', () => {
  const state = fixture(1);
  const medical = facility('medical', 'home-base', 'home-site', 1);
  const first = squad('assault', 'home-base', 0.5, 'home');
  const second = squad('skirmisher', 'home-base', 0.5, 'home-site');
  const outside = squad('assault', 'field-base', 0.5, 'field');
  state.combat.defenses = [medical];
  state.combat.friendlySquads = [first, second, outside];

  const result = applyMedicalAreaHealing(state, medical, 10);
  assert.equal(result.healedSquads, 2);
  assert.equal(first.hp, FRIENDLY_SQUAD_DEFINITIONS.assault.hp * 0.54);
  assert.equal(second.hp, FRIENDLY_SQUAD_DEFINITIONS.skirmisher.hp * 0.54);
  assert.equal(outside.hp, FRIENDLY_SQUAD_DEFINITIONS.assault.hp * 0.5);
  assert.equal(medicalCoverageForSquad(state, first)?.facility.id, medical.id);
  assert.equal(medicalCoverageForSquad(state, outside), null);
});

test('the defense update loop applies recovery-facility healing without a separate recovery queue', () => {
  const state = fixture(1);
  const medical = facility('medical', 'home-base', 'home-site', 1);
  const unit = squad('assault', 'home-base', 0.5, 'home');
  unit.status = FRIENDLY_SQUAD_STATUS.HALTED;
  state.combat.defenses = [medical];
  state.combat.friendlySquads = [unit];
  new DefenseSystem(null).updateTower(state, medical, 10, null);
  assert.equal(unit.hp, FRIENDLY_SQUAD_DEFINITIONS.assault.hp * 0.54);
});

test('a disabled recovery facility provides no healing', () => {
  const state = fixture(1);
  const medical = facility('medical', 'home-base', 'home-site', 1);
  medical.disabledTimer = 30;
  const unit = squad('assault', 'home-base', 0.4, 'home');
  state.combat.defenses = [medical];
  state.combat.friendlySquads = [unit];
  const startingHp = unit.hp;
  assert.equal(medicalCoverageForSquad(state, unit), null);
  applyMedicalAreaHealing(state, medical, 10);
  assert.equal(unit.hp, startingHp);
});

test('a field barracks adds exactly one squad slot to its field base', () => {
  const state = fixture(1);
  const base = state.world.fieldBases[0];
  assert.equal(friendlySquadCapacityForBase(state, base), 2);
  state.combat.defenses.push(facility('fieldBarracks', base.id, 'field-site'));
  assert.equal(friendlySquadCapacityForBase(state, base), 3);
  state.combat.defenses[0].disabledTimer = 5;
  assert.equal(friendlySquadCapacityForBase(state, base), 2);
});

test('field barracks is field-only while recovery facilities can use major, field, and expedition anchors', () => {
  const state = fixture(4);
  const expedition = squad('expedition', 'home-base', 1, 'remote');
  expedition.status = FRIENDLY_SQUAD_STATUS.HALTED;
  expedition.order = 'HOLD';
  state.combat.friendlySquads = [expedition];
  const system = new BuildSystem(null);

  const barracksSites = system.listBuildSites(state, 'fieldBarracks');
  assert.ok(barracksSites.length > 0);
  assert.ok(barracksSites.every(site => site.anchorKind === 'FIELD'));

  const medicalSites = system.listBuildSites(state, 'medical');
  const kinds = new Set(medicalSites.map(site => site.anchorKind));
  assert.ok(kinds.has('MAJOR'));
  assert.ok(kinds.has('FIELD'));
  assert.ok(kinds.has('EXPEDITION'));

  const expeditionSite = medicalSites.find(site => site.anchorKind === 'EXPEDITION');
  assert.ok(expeditionSite);
  assert.equal(system.buildCandidate(state, expeditionSite).ok, true);
  assert.equal(state.combat.defenses.at(-1).buildAnchorId, `expedition:${expedition.id}`);
});

test('an expedition squad creates a fixed 120 meter moving construction anchor and ordinary squads do not', () => {
  const state = fixture(4);
  const expedition = squad('expedition', 'home-base', 1, 'remote');
  expedition.status = FRIENDLY_SQUAD_STATUS.HALTED;
  expedition.order = 'HOLD';
  const assault = squad('assault', 'home-base', 1, 'enemy');
  assault.status = FRIENDLY_SQUAD_STATUS.HALTED;
  assault.order = 'HOLD';
  state.combat.friendlySquads = [expedition, assault];
  const anchors = new BuildSystem(null).getBuildAnchors(state);
  const expeditionAnchor = anchors.find(anchor => anchor.id === `expedition:${expedition.id}`);
  assert.ok(expeditionAnchor);
  assert.equal(expeditionAnchor.range, 120);
  assert.deepEqual(expeditionAnchor.point, { x: 1800, y: 0 });
  assert.equal(anchors.some(anchor => anchor.id === `expedition:${assault.id}`), false);

  expedition.nodeId = 'enemy';
  expedition.path = { nodeIds: ['enemy', 'remote'], edgeIds: ['e'], cost: 1200, targetId: 'remote' };
  expedition.pathIndex = 0;
  expedition.edgeId = 'e';
  expedition.edgeProgress = 600;
  const movingAnchor = new BuildSystem(null).getBuildAnchors(state).find(anchor => anchor.id === `expedition:${expedition.id}`);
  assert.deepEqual(movingAnchor.point, { x: 1200, y: 0 });

  expedition.status = FRIENDLY_SQUAD_STATUS.READY;
  assert.equal(new BuildSystem(null).getBuildAnchors(state).some(anchor => anchor.id === `expedition:${expedition.id}`), false);
});

test('a recovering squad occupies a slot while another slot remains usable', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.5);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  const whileRecovering = previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base');
  assert.equal(whileRecovering.ok, true);
  assert.equal(whileRecovering.reuseReadySquad, false);
  for (let second = 0; second < 90; second += 1) updateFriendlyRecovery(state, unit, 1);
  const before = { ...state.inventory.resources };
  const result = dispatchFriendlySquad(state, 'assault', 'home-base', 'enemy-base');
  assert.equal(result.redeployed, true);
  assert.equal(result.squad.id, unit.id);
  assert.deepEqual(state.inventory.resources, before);
});

test('major-base recovery progress survives save and restore without duplicate healing', () => {
  const state = fixture();
  const unit = squad('assault', 'home-base', 0.35);
  state.combat.friendlySquads = [unit];
  beginFriendlyRecovery(state, unit, 'home-base');
  updateFriendlyRecovery(state, unit, 20);
  const savedHp = unit.hp;
  assert.ok(savedHp > FRIENDLY_SQUAD_DEFINITIONS.assault.hp * 0.35);
  const repository = new SaveRepository(new MemoryStorage(), 'friendly-recovery');
  repository.save(state);
  const restored = repository.load();
  const restoredUnit = restored.combat.friendlySquads[0];
  assert.equal(restoredUnit.status, FRIENDLY_SQUAD_STATUS.RECOVERING);
  assert.equal(restoredUnit.hp, savedHp);
  assert.equal(restoredUnit.reorganizationRemaining, 25);
});

test('a recovering squad evacuates to a major base when its field base is destroyed', () => {
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
  unit.status = FRIENDLY_SQUAD_STATUS.READY;
  assert.equal(system.hold(state, unit.id).ok, false);
});

test('legacy field-aid facilities migrate once into field barracks without leaving recovery behavior behind', () => {
  const state = fixture(1);
  state.combat.defenses = [{
    id: 'legacy-aid', type: 'fieldAid', line: 'fieldAid', kind: 'tower', tier: 1,
    defenseKey: 'fieldAid1', nodeId: 'field-site', baseId: 'field-base',
    buildAnchorId: 'field:field-base', buildAnchorKind: 'FIELD',
    hp: 150, maxHp: 150, recoveryRate: 0.01, recoveryCap: 0.7,
    reorganizationSeconds: 40, recoveryCapacity: 2
  }];
  normalizeCombatState(state);
  const migrated = state.combat.defenses[0];
  assert.equal(migrated.type, 'fieldBarracks');
  assert.equal(migrated.line, 'fieldBarracks');
  assert.equal(migrated.defenseKey, 'fieldBarracks1');
  assert.equal('recoveryRate' in migrated, false);
  assert.equal('recoveryCap' in migrated, false);
  assert.equal('reorganizationSeconds' in migrated, false);
  assert.equal('recoveryCapacity' in migrated, false);
  assert.equal(friendlySquadCapacityForBase(state, 'field-base'), 3);
});

test('base reorganization remains sequential and is not accelerated by recovery facilities', () => {
  const state = fixture();
  state.combat.defenses.push(facility('medical', 'home-base', 'home-site', 4));
  const first = squad('assault', 'home-base', 0.5);
  first.id = 'first';
  const second = squad('skirmisher', 'home-base', 0.5);
  second.id = 'second';
  state.combat.friendlySquads = [first, second];
  beginFriendlyRecovery(state, first, 'home-base', 1000);
  beginFriendlyRecovery(state, second, 'home-base', 2000);
  const beforeSecond = second.reorganizationRemaining;
  assert.equal(updateFriendlyRecovery(state, first, 1).updated, true);
  const queued = updateFriendlyRecovery(state, second, 1);
  assert.equal(queued.queued, true);
  assert.equal(second.reorganizationRemaining, beforeSecond);
});
