import { consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { repairCostForDefense } from '../civilization/repair-cost.js';
import { activePlayerBases, ensurePlayerBaseState } from '../base/player-bases.js';
import { activeOwnedBases, deploymentBases, ensureFieldBaseState, ownedBaseById } from '../base/field-bases.js';
import { distanceSquared, stableId } from '../core/utilities.js';
import { activeFriendlyBarrierEdgeIds, findFriendlyRoadPath } from './routing-system.js';
import { damageEnemy, enemyPosition } from './enemy-system.js';
import { enemyUnitCount, splashDamageMultiplierForGroup } from './enemy-grouping.js';
import { destroyEnemyBase } from './enemy-base-system.js';
import { spawnEnemyBaseGuard } from './wave-system.js';
import { roadUnitPosition } from './road-unit-position.js';
import {
  FRIENDLY_RECOVERY_STATUS,
  beginFriendlyRecovery,
  recoveryPresentation,
  updateFriendlyRecovery
} from './friendly-recovery-system.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS,
  friendlySquadDefinition,
  friendlySquadRuntimeDefinition,
  friendlySquadEnemyDamage,
  friendlySquadUnlocked,
  friendlySquadLevel,
  friendlySquadXpForNextLevel
} from './friendly-force-definitions.js';
import { defenseRuntimeDefinition } from './definitions.js';
import {
  RECOVERY_ITEM_STATUS,
  SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS,
  deliverRecoveryItem,
  markRecoveryItemCarried,
  recoveryItemPoint,
  recoveryItemPresentation,
  releaseRecoveryItem,
  reserveRecoveryItem
} from '../exploration/recovery-system.js';

export { FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES } from './friendly-force-definitions.js';

export const FRIENDLY_SQUAD_STATUS = Object.freeze({
  OUTBOUND: 'OUTBOUND',
  ENGAGED: 'ENGAGED',
  ATTACKING_BASE: 'ATTACKING_BASE',
  COLLECTING_ITEM: 'COLLECTING_ITEM',
  HALTED: 'HALTED',
  RETREATING: 'RETREATING',
  WITHDRAWING: 'WITHDRAWING',
  RETURNING: 'RETURNING',
  STRANDED: 'STRANDED',
  RECOVERING: FRIENDLY_RECOVERY_STATUS.RECOVERING,
  READY: FRIENDLY_RECOVERY_STATUS.READY
});

export const FRIENDLY_ANNIHILATION_RECOVERY_SECONDS = Object.freeze({
  assault: 180,
  skirmisher: 240,
  retrieval: 180,
  siege: 420,
  heavy: 480,
  expedition: 540,
  engineer: 660,
  artillery: 720,
  command: 900
});

export const ROADSIDE_SPEED_BOOST_MULTIPLIER = 0.20;

const SKIRMISHER_AVOID_ENEMY_TYPES = new Set([
  'shield', 'heavy', 'siegeBreaker', 'sapper', 'bronzeShield', 'siegeCaptain', 'ironclad', 'heavySiege',
  'commander', 'ironSaboteur', 'bodyguard', 'steelGuard', 'demolitionEngineer', 'steelCaptain',
  'mechanicalSiege', 'armoredAgent', 'machineCommander', 'royalGuard', 'fortressBreaker', 'royalCommander'
]);

function skirmisherTargetRisk(enemy) {
  if (!enemy) return 0;
  const count = enemyUnitCount(enemy);
  const armored = SKIRMISHER_AVOID_ENEMY_TYPES.has(enemy.type) ? 1 : 0;
  const crowd = count >= 32 ? 3 : count >= 18 ? 2 : count >= 10 ? 1 : 0;
  return armored * 4 + crowd;
}

function shouldSkirmisherAutoWithdraw(squad, definition, enemy) {
  if (squad?.type !== 'skirmisher' || !enemy) return false;
  const maxHp = Math.max(1, Number(squad.maxHp) || Number(definition.hp) || 1);
  const hpRatio = Math.max(0, Number(squad.hp) || 0) / maxHp;
  if (hpRatio > 0.35) return false;
  return skirmisherTargetRisk(enemy) >= 2 || enemyUnitCount(enemy) >= 12;
}

export const FRIENDLY_SQUAD_MISSION = Object.freeze({ ATTACK: 'ATTACK', INTERCEPT: 'INTERCEPT', RECOVERY: 'RECOVERY' });

export const FRIENDLY_SQUAD_ORDER = Object.freeze({
  ADVANCE: 'ADVANCE',
  HOLD: 'HOLD',
  RETREAT: 'RETREAT',
  WITHDRAW: 'WITHDRAW',
  RETURN: 'RETURN'
});

const VALID_STATUS = new Set(Object.values(FRIENDLY_SQUAD_STATUS));
const VALID_ORDER = new Set(Object.values(FRIENDLY_SQUAD_ORDER));

const FRIENDLY_GLOBAL_COMMAND_LIMITS = Object.freeze([6, 10, 14, 18, 22, 28, 34, 40]);
const FRIENDLY_MAJOR_BASE_CAPACITY = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9]);
const FRIENDLY_COORDINATED_LIMITS = Object.freeze([3, 3, 4, 5, 6, 7, 8, 8]);

function civilizationTableValue(table, state) {
  const index = Math.max(0, Math.min(table.length - 1, Math.floor(Number(state.civilization?.level) || 0)));
  return table[index];
}

export function friendlyGlobalCommandLimit(state) { return civilizationTableValue(FRIENDLY_GLOBAL_COMMAND_LIMITS, state); }
export function friendlyCoordinatedDeploymentLimit(state) { return civilizationTableValue(FRIENDLY_COORDINATED_LIMITS, state); }
export function friendlyGlobalCommandStatus(state) {
  const assigned = (state.combat?.friendlySquads ?? []).filter(squad => squad.hp > 0).length;
  const capacity = friendlyGlobalCommandLimit(state);
  return { capacity, assigned, available: Math.max(0, capacity - assigned) };
}

function statusForOrder(order) {
  if (order === FRIENDLY_SQUAD_ORDER.HOLD) return FRIENDLY_SQUAD_STATUS.HALTED;
  if (order === FRIENDLY_SQUAD_ORDER.RETREAT) return FRIENDLY_SQUAD_STATUS.RETREATING;
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) return FRIENDLY_SQUAD_STATUS.WITHDRAWING;
  if (order === FRIENDLY_SQUAD_ORDER.RETURN) return FRIENDLY_SQUAD_STATUS.RETURNING;
  return FRIENDLY_SQUAD_STATUS.OUTBOUND;
}

function normalizePath(path) {
  if (!path || !Array.isArray(path.nodeIds) || !Array.isArray(path.edgeIds)) return null;
  return {
    nodeIds: [...path.nodeIds],
    edgeIds: [...path.edgeIds],
    cost: Math.max(0, Number(path.cost) || 0),
    targetId: path.targetId ?? path.nodeIds[path.nodeIds.length - 1] ?? null
  };
}

function validatedDeploymentPath(state, path, startNodeId, targetNodeId) {
  const normalized = normalizePath(path);
  const graph = state.world?.roadGraph;
  if (!normalized || !graph?.nodeById?.has(startNodeId) || !graph.nodeById.has(targetNodeId)) return null;
  if (normalized.nodeIds.length !== normalized.edgeIds.length + 1) return null;
  if (normalized.nodeIds[0] !== startNodeId || normalized.nodeIds.at(-1) !== targetNodeId) return null;
  const blocked = activeFriendlyBarrierEdgeIds(state);
  let physicalDistance = 0;
  for (let index = 0; index < normalized.edgeIds.length; index += 1) {
    const edge = graph.edgeById.get(normalized.edgeIds[index]);
    const from = normalized.nodeIds[index];
    const to = normalized.nodeIds[index + 1];
    if (!edge || edge.routingDisabled || blocked.has(edge.id)) return null;
    if (!((edge.a === from && edge.b === to) || (edge.a === to && edge.b === from))) return null;
    physicalDistance += Math.max(0, Number(edge.length) || 0);
  }
  return { ...normalized, cost: physicalDistance, targetId: targetNodeId };
}

function routePhysicalDistance(state, path) {
  let total = 0;
  for (const edgeId of path?.edgeIds ?? []) total += Math.max(0, Number(state.world?.roadGraph?.edgeById?.get(edgeId)?.length) || 0);
  return total;
}

export function ensureFriendlyForceState(state) {
  ensurePlayerBaseState(state);
  ensureFieldBaseState(state);
  state.combat.friendlySquads = Array.isArray(state.combat.friendlySquads) ? state.combat.friendlySquads : [];
  for (const squad of state.combat.friendlySquads) {
    const definition = friendlySquadRuntimeDefinition(state, squad.type, squad);
    squad.type = definition.type;
    squad.unitLevel = friendlySquadLevel(squad);
    squad.unitXp = Math.max(0, Number(squad.unitXp) || 0);
    const previousMaxHp = Math.max(1, Number(squad.maxHp) || definition.hp);
    const previousHp = Math.max(0, Math.min(previousMaxHp, Number(squad.hp ?? previousMaxHp) || 0));
    squad.maxHp = Math.max(1, definition.hp);
    squad.hp = Math.max(0, Math.min(squad.maxHp, previousMaxHp === squad.maxHp ? previousHp : previousHp / previousMaxHp * squad.maxHp));
    squad.status = VALID_STATUS.has(squad.status) ? squad.status : FRIENDLY_SQUAD_STATUS.OUTBOUND;
    squad.order = VALID_ORDER.has(squad.order)
      ? squad.order
      : squad.status === FRIENDLY_SQUAD_STATUS.RETURNING
        ? FRIENDLY_SQUAD_ORDER.RETURN
        : FRIENDLY_SQUAD_ORDER.ADVANCE;
    squad.missionType = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY || definition.missionKind === 'RECOVERY'
      ? FRIENDLY_SQUAD_MISSION.RECOVERY
      : squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT || squad.targetEnemyId
        ? FRIENDLY_SQUAD_MISSION.INTERCEPT
        : FRIENDLY_SQUAD_MISSION.ATTACK;
    squad.missionTargetBaseId ??= squad.targetBaseId ?? null;
    squad.targetEnemyId ??= null;
    squad.targetRecoveryItemId ??= null;
    squad.recoveryCollectionProgressSec = squad.recoveryCollectionProgressSec == null
      ? null
      : Math.max(0, Math.min(SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS, Number(squad.recoveryCollectionProgressSec) || 0));
    squad.commandDestinationNodeId ??= squad.path?.targetId ?? null;
    squad.heldOrder = VALID_ORDER.has(squad.heldOrder) ? squad.heldOrder : null;
    squad.heldDestinationNodeId ??= null;
    squad.pathIndex = Math.max(0, Number(squad.pathIndex) || 0);
    squad.edgeProgress = Math.max(0, Number(squad.edgeProgress) || 0);
    squad.combatCooldown = Math.max(0, Number(squad.combatCooldown) || 0);
    squad.departDelay = Math.max(0, Number(squad.departDelay) || 0);
    squad.formationId ??= null;
    squad.formationTargetId ??= null;
    squad.formationSpeed = squad.formationSpeed == null ? null : Math.max(0.1, Number(squad.formationSpeed) || 0.1);
    squad.formationSize = squad.formationSize == null ? null : Math.max(1, Math.floor(Number(squad.formationSize) || 1));
    squad.engagedEnemyId ??= null;
    squad.reroutePending = Boolean(squad.reroutePending);
    squad.path = normalizePath(squad.path);
    squad.travelHistoryNodeIds = Array.isArray(squad.travelHistoryNodeIds) && squad.travelHistoryNodeIds.length
      ? [...squad.travelHistoryNodeIds]
      : [squad.nodeId].filter(Boolean);
    squad.recoveryBaseId ??= null;
    squad.recoveryStartedAt = Number(squad.recoveryStartedAt) || null;
    squad.reorganizationRemaining = Math.max(0, Number(squad.reorganizationRemaining) || 0);
    delete squad.recoveryTargetHp;
    delete squad.recoveryFacilityType;
    delete squad.recoveryFacilityId;
    squad.readyAt = Number(squad.readyAt) || null;
    squad.annihilatedRecovery = Boolean(squad.annihilatedRecovery);
    squad.annihilatedAt = Number(squad.annihilatedAt) || null;
    squad.roadsideSpeedBoostUntil = Math.max(0, Number(squad.roadsideSpeedBoostUntil) || 0);
    squad.roadsideSpeedBoostMultiplier = Math.max(0, Number(squad.roadsideSpeedBoostMultiplier) || 0);
  }
  return state.combat.friendlySquads;
}

export function friendlySquadPosition(state, squad) {
  return roadUnitPosition(state, squad);
}

export function friendlySquadById(state, squadId) {
  return (state.combat?.friendlySquads ?? []).find(squad => squad.id === squadId && squad.hp > 0) ?? null;
}

function squadsFromBase(state, baseId) {
  return (state.combat?.friendlySquads ?? []).filter(squad => squad.originBaseId === baseId && squad.hp > 0);
}

function fieldBarracksCapacityBonus(state, baseId) {
  if (!baseId) return 0;
  const facility = (state.combat?.defenses ?? []).find(defense =>
    defense.type === 'fieldBarracks'
    && defense.baseId === baseId
    && defense.hp > 0
    && (defense.disabledTimer ?? 0) <= 0
  );
  if (!facility) return 0;
  return Math.max(0, Math.floor(Number(defenseRuntimeDefinition(facility).squadCapacityBonus) || 0));
}

export function friendlySquadCapacityForBase(state, baseOrId) {
  const base = typeof baseOrId === 'string' ? ownedBaseById(state, baseOrId, { includeDestroyed: true }) : baseOrId;
  if (!base) return 0;
  const civilizationLevel = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  if (base.kind === 'FIELD') {
    return 2 + Math.floor(civilizationLevel / 2) + fieldBarracksCapacityBonus(state, base.id);
  }
  return FRIENDLY_MAJOR_BASE_CAPACITY[Math.min(FRIENDLY_MAJOR_BASE_CAPACITY.length - 1, civilizationLevel)];
}

export function friendlySquadCapacityStatus(state, baseOrId) {
  const base = typeof baseOrId === 'string' ? ownedBaseById(state, baseOrId, { includeDestroyed: true }) : baseOrId;
  if (!base) return { capacity: 0, assigned: 0, active: 0, recovering: 0, ready: 0, available: 0 };
  const squads = squadsFromBase(state, base.id);
  const recovering = squads.filter(squad => squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING).length;
  const ready = squads.filter(squad => squad.status === FRIENDLY_SQUAD_STATUS.READY).length;
  const active = squads.length - recovering - ready;
  const capacity = friendlySquadCapacityForBase(state, base);
  return { capacity, assigned: squads.length, active, recovering, ready, available: Math.max(0, capacity - squads.length) };
}

function garrisonSquadsFromBase(state, baseId) {
  return squadsFromBase(state, baseId).filter(squad => [FRIENDLY_SQUAD_STATUS.READY, FRIENDLY_SQUAD_STATUS.RECOVERING].includes(squad.status));
}

function planningReservationCount(planning, baseId) {
  return Math.max(0, Number(planning?.additionalSquadsByBase?.get(baseId)) || 0);
}

function planningSquadReserved(planning, squadId) {
  return Boolean(squadId && planning?.reservedSquadIds?.has(squadId));
}

function planningTypeReservationCount(planning, baseId, squadType) {
  return Math.max(0, Number(planning?.squadTypesByBase?.get(`${baseId}:${squadType}`)) || 0);
}

function reservePlanningSlot(planning, preview) {
  if (!planning || !preview?.origin) return;
  if (preview.garrison?.id) planning.reservedSquadIds.add(preview.garrison.id);
  else {
    planning.additionalSquadsByBase.set(
      preview.origin.id,
      planningReservationCount(planning, preview.origin.id) + 1
    );
  }
  if (!preview.reuseReadySquad) {
    const key = `${preview.origin.id}:${preview.definition.type}`;
    planning.squadTypesByBase.set(key, planningTypeReservationCount(planning, preview.origin.id, preview.definition.type) + 1);
  }
}

export function enemyPursuitNodeId(state, enemy) {
  const graph = state.world?.roadGraph;
  if (!graph || !enemy) return null;
  const pathNodeIds = Array.isArray(enemy.path?.nodeIds) ? enemy.path.nodeIds : [];
  const nextNodeId = pathNodeIds.length
    ? pathNodeIds[Math.min(Math.max(0, Number(enemy.pathIndex) || 0) + 1, pathNodeIds.length - 1)]
    : null;
  if (nextNodeId && graph.nodeById.has(nextNodeId)) return nextNodeId;
  return graph.nodeById.has(enemy.nodeId) ? enemy.nodeId : null;
}

function deploymentTarget(state, definition, targetId, targetKind = 'enemyBase') {
  if (definition.missionKind === 'RECOVERY') {
    if (state.world.recoveryCollection?.itemId === targetId) return null;
    const item = (state.world?.recoveryItems ?? []).find(value => value.id === targetId && value.status === RECOVERY_ITEM_STATUS.AVAILABLE) ?? null;
    return item ? { target: item, nodeId: item.nodeId, missionType: FRIENDLY_SQUAD_MISSION.RECOVERY, targetKind: 'recoveryItem' } : null;
  }
  if (targetKind === 'enemy') {
    const enemy = state.combat.enemies.find(value => value.id === targetId && value.hp > 0 && value.departDelay <= 0) ?? null;
    const nodeId = enemyPursuitNodeId(state, enemy);
    return enemy && nodeId ? { target: enemy, nodeId, missionType: FRIENDLY_SQUAD_MISSION.INTERCEPT, targetKind: 'enemy' } : null;
  }
  const base = state.world.enemyBases.find(value => value.id === targetId && value.alive && value.hp > 0) ?? null;
  return base ? { target: base, nodeId: base.nodeId, missionType: FRIENDLY_SQUAD_MISSION.ATTACK, targetKind: 'enemyBase' } : null;
}

function unavailableTargetReason(definition, targetKind) {
  if (definition.missionKind === 'RECOVERY') return 'This is not a recoverable special item.';
  if (targetKind === 'enemy') return 'This enemy cannot be intercepted.';
  return 'This enemy base cannot be attacked.';
}

function unreachableTargetReason(definition, targetKind) {
  if (definition.missionKind === 'RECOVERY') return 'No road route reaches the recovery point.';
  if (targetKind === 'enemy') return 'No road route reaches the enemy squad path.';
  return 'No road route reaches the enemy base.';
}

export function previewFriendlyDeployment(state, squadType, originBaseId, targetId, planning = null, targetKind = 'enemyBase', routeOverride = null) {
  const baseDefinition = FRIENDLY_SQUAD_DEFINITIONS[squadType];
  if (!baseDefinition) return { ok: false, reason: 'Selected squad type does not exist.' };
  const definition = friendlySquadRuntimeDefinition(state, squadType);
  if (!friendlySquadUnlocked(state, squadType)) return { ok: false, reason: `${definition.name} Civ Lv.${definition.unlockLevel} required.`, definition };
  const origin = ownedBaseById(state, originBaseId);
  if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: 'No available base can dispatch this squad.', definition };
  if (!deploymentBases(state, squadType).some(base => base.id === origin.id)) return { ok: false, reason: `${definition.name} cannot be dispatched from this base.`, definition };
  const resolved = deploymentTarget(state, definition, targetId, targetKind);
  if (!resolved) return { ok: false, reason: unavailableTargetReason(definition, targetKind), definition };
  const overriddenPath = routeOverride ? validatedDeploymentPath(state, routeOverride, origin.nodeId, resolved.nodeId) : null;
  if (routeOverride && !overriddenPath) return { ok: false, reason: 'The selected dispatch route became unavailable due to road updates or walls. Choose another route.', definition, origin, target: resolved.target, missionType: resolved.missionType };
  const path = overriddenPath ?? findFriendlyRoadPath(state, origin.nodeId, resolved.nodeId);
  if (!path) return { ok: false, reason: unreachableTargetReason(definition, targetKind), definition };

  const routeDistance = routePhysicalDistance(state, path);
  const assignedSquads = squadsFromBase(state, origin.id);
  const capacity = friendlySquadCapacityForBase(state, origin);
  const plannedAdditional = planningReservationCount(planning, origin.id);
  const availableGarrisons = garrisonSquadsFromBase(state, origin.id)
    .filter(squad => !planningSquadReserved(planning, squad.id));
  const reusableGarrison = availableGarrisons.find(squad => squad.status === FRIENDLY_SQUAD_STATUS.READY && squad.type === squadType) ?? null;
  const canCreateNewSquad = assignedSquads.length + plannedAdditional < capacity;
  const replaceableGarrison = !reusableGarrison && !canCreateNewSquad
    ? availableGarrisons.find(squad => squad.status === FRIENDLY_SQUAD_STATUS.READY && squad.type !== squadType) ?? null
    : null;
  const plannedGlobal = planning ? [...planning.additionalSquadsByBase.values()].reduce((total, value) => total + value, 0) : 0;
  const globalStatus = friendlyGlobalCommandStatus(state);
  if (!reusableGarrison && !replaceableGarrison && globalStatus.assigned + plannedGlobal >= globalStatus.capacity) {
    return { ok: false, reason: `Global command limit reached (${globalStatus.assigned + plannedGlobal}/${globalStatus.capacity}). Return or reorganize existing squads before dispatching.`, definition, origin, target: resolved.target, missionType: resolved.missionType, path, routeDistance };
  }
  const plannedTypeCount = planningTypeReservationCount(planning, origin.id, squadType);
  if (definition.maxPerBase && !reusableGarrison && assignedSquads.filter(squad => squad.type === squadType).length + plannedTypeCount >= definition.maxPerBase) {
    return { ok: false, reason: `${definition.name} is limited to ${definition.maxPerBase} per major base.`, definition, origin, target: resolved.target, missionType: resolved.missionType, path, routeDistance };
  }
  if (!reusableGarrison && !canCreateNewSquad && !replaceableGarrison) {
    const capacityStatus = friendlySquadCapacityStatus(state, origin);
    const recoveryNote = capacityStatus.recovering ? ` · Recovering ${capacityStatus.recovering}` : '';
    return {
      ok: false,
      reason: `This base has no open squad slots (${capacityStatus.assigned + plannedAdditional}/${capacity}${recoveryNote}). Raise civilization level or reorganize idle squads.`,
      definition,
      origin,
      target: resolved.target,
      missionType: resolved.missionType,
      path,
      routeDistance,
      capacity,
      assignedSquads: capacityStatus.assigned,
      plannedAdditional
    };
  }
  const garrison = reusableGarrison ?? replaceableGarrison;
  const reuseReadySquad = Boolean(reusableGarrison);
  const replaceReadySquad = Boolean(replaceableGarrison);
  const deploymentCost = reuseReadySquad ? {} : definition.cost;
  const missing = missingBundle(state, deploymentCost);
  return {
    ok: Object.keys(missing).length === 0,
    reason: Object.keys(missing).length ? 'Resources required for dispatch are insufficient.' : null,
    origin,
    target: resolved.target,
    missionType: resolved.missionType,
    targetKind: resolved.targetKind,
    path,
    routeDistance,
    cost: { ...deploymentCost },
    missing,
    definition,
    garrison,
    reuseReadySquad,
    replaceReadySquad,
    capacity,
    assignedSquads: assignedSquads.length,
    availableSlots: Math.max(0, capacity - assignedSquads.length - plannedAdditional)
  };
}

function instantiateFriendlySquad(state, preview, squadType, originBaseId, targetId, events = null, formation = null) {
  const definition = preview.definition;
  const worldTime = state.runtime?.worldTimeMs ?? Date.now();
  const squadId = preview.reuseReadySquad && preview.garrison
    ? preview.garrison.id
    : stableId('friendly_squad', definition.type, originBaseId, targetId, worldTime, state.combat.friendlySquads.length);
  if (preview.replaceReadySquad && preview.garrison) {
    state.combat.friendlySquads = state.combat.friendlySquads.filter(item => item.id !== preview.garrison.id);
  }
  const squad = preview.reuseReadySquad && preview.garrison ? preview.garrison : {
    id: squadId,
    type: definition.type, hp: definition.hp, maxHp: definition.hp, members: definition.members, originBaseId, deployedAt: worldTime, unitLevel: 1, unitXp: 0
  };
  Object.assign(squad, {
    type: definition.type,
    members: definition.members,
    missionType: preview.missionType,
    originBaseId,
    targetBaseId: preview.missionType === FRIENDLY_SQUAD_MISSION.ATTACK ? targetId : null,
    missionTargetBaseId: preview.missionType === FRIENDLY_SQUAD_MISSION.ATTACK ? targetId : null,
    targetEnemyId: preview.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT ? targetId : null,
    targetRecoveryItemId: preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY ? targetId : null,
    recoveryCollectionProgressSec: null,
    nodeId: preview.origin.nodeId,
    path: normalizePath(preview.path), pathIndex: 0, edgeId: preview.path.edgeIds[0] ?? null, edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.OUTBOUND, order: FRIENDLY_SQUAD_ORDER.ADVANCE,
    commandDestinationNodeId: preview.path.targetId, travelHistoryNodeIds: [preview.origin.nodeId],
    engagedEnemyId: null, combatCooldown: 0, departDelay: Math.max(0, Number(formation?.departDelay) || 0),
    formationId: formation?.id ?? null,
    formationTargetId: formation?.targetId ?? null,
    formationSpeed: formation?.speed ?? null,
    formationSize: formation?.size ?? null,
    recoveryBaseId: null, recoveryStartedAt: null, reorganizationRemaining: 0,
    readyAt: null, deployedAt: worldTime, unitLevel: friendlySquadLevel(squad), unitXp: Math.max(0, Number(squad.unitXp) || 0)
  });
  if (!preview.reuseReadySquad) state.combat.friendlySquads.push(squad);
  events?.emit('friendly:squad-deployed', { squad, origin: preview.origin, target: preview.target, cost: preview.cost, redeployed: preview.reuseReadySquad, formationId: formation?.id ?? null });
  const targetLabel = preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
    ? `Recover ${recoveryItemPresentation(preview.target).name}`
    : preview.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT
      ? 'intercept specified enemy squad'
      : '';
  events?.emit('message', { text: preview.reuseReadySquad ? `${definition.name} dispatched from ${preview.origin.name} ${targetLabel || ''}.` : `${definition.name} dispatched from ${preview.origin.name} ${targetLabel || ''}.` });
  return { squad, cost: preview.cost, routeDistance: preview.routeDistance, redeployed: preview.reuseReadySquad, replaced: preview.replaceReadySquad };
}

export function dispatchFriendlySquad(state, squadType, originBaseId, targetId, events = null, targetKind = 'enemyBase', routeOverride = null) {
  const preview = previewFriendlyDeployment(state, squadType, originBaseId, targetId, null, targetKind, routeOverride);
  if (!preview.ok) return preview;

  let reservation = null;
  const squadId = preview.reuseReadySquad && preview.garrison
    ? preview.garrison.id
    : stableId('friendly_squad', preview.definition.type, originBaseId, targetId, state.runtime?.worldTimeMs ?? Date.now(), state.combat.friendlySquads.length);
  if (preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
    reservation = reserveRecoveryItem(state, targetId, squadId);
    if (!reservation.ok) return reservation;
  }

  if (!consumeBundle(state, preview.cost)) {
    if (reservation) releaseRecoveryItem(state, targetId, squadId);
    return { ok: false, reason: 'Resources were missing when dispatch was confirmed.' };
  }
  const result = instantiateFriendlySquad(state, preview, squadType, originBaseId, targetId, events);
  return { ok: true, ...result };
}

function addCost(total, bundle) {
  for (const [resource, amount] of Object.entries(bundle ?? {})) total[resource] = (total[resource] ?? 0) + amount;
  return total;
}


export const COORDINATED_DEPLOYMENT_TIMING = Object.freeze({
  LEAD: 'LEAD',
  SYNCHRONIZED: 'SYNCHRONIZED',
  MANUAL: 'MANUAL'
});

const FORMATION_ROLE_ORDER = Object.freeze({
  skirmisher: 0,
  assault: 1,
  command: 2,
  heavy: 3,
  expedition: 4,
  siege: 5,
  engineer: 6,
  artillery: 7
});

const LEAD_DEPARTURE_SECONDS = Object.freeze({
  skirmisher: 0,
  assault: 10,
  command: 12,
  heavy: 14,
  expedition: 16,
  siege: 24,
  engineer: 28,
  artillery: 30
});

function normalizedCoordinatedOptions(options = null) {
  const timingMode = Object.values(COORDINATED_DEPLOYMENT_TIMING).includes(options?.timingMode)
    ? options.timingMode
    : COORDINATED_DEPLOYMENT_TIMING.LEAD;
  const manualDelays = Object.fromEntries(Object.entries(options?.manualDelays ?? {})
    .map(([type, value]) => [type, Math.max(0, Math.min(180, Math.floor(Number(value) || 0)))]));
  return { timingMode, manualDelays, routeOverride: normalizePath(options?.routeOverride) };
}

function formationRoleForType(type) {
  if (type === 'skirmisher') return 'Vanguard';
  if (type === 'assault') return 'main body';
  if (type === 'siege') return 'siege';
  if (type === 'heavy') return 'Guard';
  if (type === 'engineer') return 'rearSupport';
  if (type === 'artillery') return 'rearfirepower';
  if (type === 'command') return 'command';
  if (type === 'expedition') return 'Frontline support';
  return 'main body';
}

function applyCoordinatedTiming(assignments, options) {
  const normalized = normalizedCoordinatedOptions(options);
  const byTypeIndex = new Map();
  if (normalized.timingMode === COORDINATED_DEPLOYMENT_TIMING.SYNCHRONIZED) {
    const estimatedArrivalSeconds = Math.max(...assignments.map(assignment => {
      const naturalSpeed = Math.max(0.1, Number(assignment.definition.speed) || 0.1);
      return Math.max(0, Number(assignment.routeDistance) || 0) / naturalSpeed;
    }));
    for (const assignment of assignments) {
      const naturalSpeed = Math.max(0.1, Number(assignment.definition.speed) || 0.1);
      assignment.synchronizedSpeed = naturalSpeed;
      assignment.travelSeconds = Math.max(0, Number(assignment.routeDistance) || 0) / naturalSpeed;
      assignment.departDelay = Math.max(0, estimatedArrivalSeconds - assignment.travelSeconds);
      assignment.formationRole = formationRoleForType(assignment.squadType);
    }
    return { timingMode: normalized.timingMode, estimatedArrivalSeconds };
  }
  let estimatedArrivalSeconds = 0;
  const ordered = [...assignments].sort((left, right) =>
    (FORMATION_ROLE_ORDER[left.squadType] ?? 50) - (FORMATION_ROLE_ORDER[right.squadType] ?? 50)
    || left.requestIndex - right.requestIndex
  );
  for (const assignment of ordered) {
    const sameTypeIndex = byTypeIndex.get(assignment.squadType) ?? 0;
    byTypeIndex.set(assignment.squadType, sameTypeIndex + 1);
    const baseDelay = normalized.timingMode === COORDINATED_DEPLOYMENT_TIMING.MANUAL
      ? normalized.manualDelays[assignment.squadType] ?? 0
      : LEAD_DEPARTURE_SECONDS[assignment.squadType] ?? Math.min(30, (FORMATION_ROLE_ORDER[assignment.squadType] ?? 3) * 5);
    assignment.departDelay = Math.max(0, Number(baseDelay) || 0) + sameTypeIndex * 3;
    assignment.synchronizedSpeed = Math.max(0.1, Number(assignment.definition.speed) || 0.1);
    assignment.travelSeconds = Math.max(0, Number(assignment.routeDistance) || 0) / assignment.synchronizedSpeed;
    assignment.formationRole = formationRoleForType(assignment.squadType);
    estimatedArrivalSeconds = Math.max(estimatedArrivalSeconds, assignment.departDelay + assignment.travelSeconds);
  }
  return { timingMode: normalized.timingMode, estimatedArrivalSeconds };
}

function coordinatedTimingLabel(mode) {
  if (mode === COORDINATED_DEPLOYMENT_TIMING.SYNCHRONIZED) return 'synchronized arrival';
  if (mode === COORDINATED_DEPLOYMENT_TIMING.MANUAL) return 'Manual';
  return 'Vanguard';
}

function commonDeploymentBaseCandidates(state, requested) {
  const baseById = new Map();
  for (const item of requested) {
    for (const base of deploymentBases(state, item.type)) {
      baseById.set(base.id, base);
    }
  }
  return [...baseById.values()].filter(base => requested.every(item => deploymentBases(state, item.type).some(candidate => candidate.id === base.id)));
}

function previewCoordinatedFromOrigin(state, targetId, requested, origin, sharedRoute) {
  const planning = {
    additionalSquadsByBase: new Map(),
    squadTypesByBase: new Map(),
    reservedSquadIds: new Set()
  };
  const assignments = [];
  for (const item of requested) {
    const preview = previewFriendlyDeployment(state, item.type, origin.id, targetId, planning, 'enemyBase', sharedRoute);
    if (!preview.origin || !preview.path) return { ok: false, reason: preview.reason ?? `Shared route is unavailable for ${item.definition.name}.`, assignments };
    if (!preview.ok && Object.keys(preview.missing ?? {}).length === 0) return { ok: false, reason: preview.reason ?? `${item.definition.name} cannot be dispatched.`, assignments };
    reservePlanningSlot(planning, preview);
    assignments.push({ ...preview, squadType: item.type, requestIndex: item.index });
  }
  return { ok: true, assignments };
}

export function previewCoordinatedDeployment(state, targetId, squadTypes, options = null) {
  const normalizedOptions = normalizedCoordinatedOptions(options);
  const requested = (Array.isArray(squadTypes) ? squadTypes : [])
    .filter(type => FRIENDLY_SQUAD_DEFINITIONS[type]?.missionKind !== 'RECOVERY')
    .slice(0, friendlyCoordinatedDeploymentLimit(state))
    .map((type, index) => ({ type, index, definition: FRIENDLY_SQUAD_DEFINITIONS[type] ? friendlySquadRuntimeDefinition(state, type) : null }))
    .filter(item => item.definition);
  if (requested.length < 2) return { ok: false, reason: 'Select at least two squads for coordinated dispatch.', assignments: [], squadTypes: requested.map(item => item.type) };
  for (const item of requested) {
    if (!friendlySquadUnlocked(state, item.type)) return { ok: false, reason: `${item.definition.name} Civ Lv.${item.definition.unlockLevel} required.`, assignments: [] };
  }
  const target = state.world.enemyBases.find(base => base.id === targetId && base.alive && base.hp > 0) ?? null;
  if (!target) return { ok: false, reason: 'This enemy base cannot be attacked.', assignments: [] };

  const candidates = [];
  for (const origin of commonDeploymentBaseCandidates(state, requested)) {
    const seedPreview = previewFriendlyDeployment(state, requested[0].type, origin.id, targetId, null, 'enemyBase', normalizedOptions.routeOverride);
    if (!seedPreview.path) continue;
    const candidate = previewCoordinatedFromOrigin(state, targetId, requested, origin, seedPreview.path);
    if (!candidate.ok) {
      candidates.push({ ...candidate, origin, routeDistance: seedPreview.routeDistance ?? Infinity, path: seedPreview.path });
      continue;
    }
    const routeDistance = routePhysicalDistance(state, seedPreview.path);
    candidates.push({ ...candidate, origin, routeDistance, path: seedPreview.path });
  }
  const viable = candidates
    .filter(candidate => candidate.ok)
    .sort((left, right) => (left.routeDistance ?? Infinity) - (right.routeDistance ?? Infinity)
      || String(left.origin?.id ?? '').localeCompare(String(right.origin?.id ?? '')));
  const selected = viable[0] ?? null;
  if (!selected) {
    const reason = candidates.find(candidate => candidate.reason)?.reason;
    return { ok: false, reason: reason ?? 'Coordinated dispatch requires squads from the same base with a shared route. Check squad slots, unlock level, and dispatch origin.', assignments: [], target };
  }

  const assignments = [...selected.assignments].sort((left, right) => left.requestIndex - right.requestIndex);
  const cost = assignments.reduce((total, assignment) => addCost(total, assignment.cost), {});
  const missing = missingBundle(state, cost);
  const slowestSpeed = Math.min(...assignments.map(assignment => Math.max(0.1, Number(assignment.definition.speed) || 0.1)));
  const fastestSpeed = Math.max(...assignments.map(assignment => Math.max(0.1, Number(assignment.definition.speed) || 0.1)));
  const maximumDistance = Math.max(...assignments.map(assignment => Math.max(0, Number(assignment.routeDistance) || 0)));
  const timing = applyCoordinatedTiming(assignments, normalizedOptions);
  return {
    ok: Object.keys(missing).length === 0,
    reason: Object.keys(missing).length ? 'Required resources for coordinated dispatch are missing.' : null,
    target,
    origin: selected.origin,
    commonRoute: normalizePath(selected.path),
    assignments,
    cost,
    missing,
    synchronizedSpeed: null,
    slowestSpeed,
    fastestSpeed,
    maximumRouteDistance: maximumDistance,
    estimatedArrivalSeconds: timing.estimatedArrivalSeconds,
    timingMode: timing.timingMode,
    timingLabel: coordinatedTimingLabel(timing.timingMode),
    commonRouteDistance: selected.routeDistance
  };
}

export function dispatchCoordinatedSquads(state, targetId, squadTypes, events = null, options = null) {
  const preview = previewCoordinatedDeployment(state, targetId, squadTypes, options);
  if (!preview.ok) return preview;
  if (!consumeBundle(state, preview.cost)) return { ok: false, reason: 'Resources are missing while confirming coordinated dispatch.', preview };
  const worldTime = state.runtime?.worldTimeMs ?? Date.now();
  const formation = {
    id: stableId('friendly_formation', targetId, worldTime, state.combat.friendlySquads.length),
    targetId,
    speed: null,
    size: preview.assignments.length,
    timingMode: preview.timingMode,
    originBaseId: preview.origin?.id ?? null
  };
  const squads = preview.assignments.map(assignment => instantiateFriendlySquad(
    state,
    { ...assignment, cost: {} },
    assignment.squadType,
    assignment.origin.id,
    targetId,
    events,
    {
      ...formation,
      speed: assignment.synchronizedSpeed,
      departDelay: assignment.departDelay,
      role: assignment.formationRole
    }
  ).squad);
  events?.emit('friendly:formation-deployed', { formationId: formation.id, targetId, squadIds: squads.map(squad => squad.id), cost: preview.cost, timingMode: preview.timingMode, originBaseId: formation.originBaseId });
  events?.emit('message', { text: `${squads.length} squads advance from the same base on the same route with ${preview.timingLabel}.` });
  return { ok: true, squads, formationId: formation.id, cost: preview.cost, estimatedArrivalSeconds: preview.estimatedArrivalSeconds, timingMode: preview.timingMode, originBaseId: formation.originBaseId };
}

export function previewAssaultDeployment(state, originBaseId, targetBaseId) { return previewFriendlyDeployment(state, 'assault', originBaseId, targetBaseId); }
export function dispatchAssaultSquad(state, originBaseId, targetBaseId, events = null) { return dispatchFriendlySquad(state, 'assault', originBaseId, targetBaseId, events); }

function clearEnemyEngagements(state, squadId) {
  for (const enemy of state.combat.enemies) {
    if (enemy.engagedSquadId === squadId) enemy.engagedSquadId = null;
  }
}

function appendHistory(squad, nodeId) {
  if (!nodeId) return;
  squad.travelHistoryNodeIds ??= [];
  if (squad.travelHistoryNodeIds[squad.travelHistoryNodeIds.length - 1] !== nodeId) squad.travelHistoryNodeIds.push(nodeId);
  if (squad.travelHistoryNodeIds.length > 96) squad.travelHistoryNodeIds.splice(0, squad.travelHistoryNodeIds.length - 96);
}

function routeMatchesGraph(state, route, expectedStartNodeId, expectedDestinationNodeId = null) {
  if (!route || route.nodeIds.length !== route.edgeIds.length + 1) return false;
  if (route.nodeIds[0] !== expectedStartNodeId) return false;
  if (expectedDestinationNodeId && route.nodeIds[route.nodeIds.length - 1] !== expectedDestinationNodeId) return false;
  for (let index = 0; index < route.edgeIds.length; index += 1) {
    const edge = state.world.roadGraph.edgeById.get(route.edgeIds[index]);
    const from = route.nodeIds[index];
    const to = route.nodeIds[index + 1];
    if (!edge || !((edge.a === from && edge.b === to) || (edge.a === to && edge.b === from))) return false;
  }
  return true;
}

function assignPathAtCurrentPosition(state, squad, route, expectedDestinationNodeId = null) {
  const normalized = normalizePath(route);
  if (!normalized) return false;
  const currentEdge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  const movingInsideEdge = Boolean(squad.edgeId && currentEdge && squad.edgeProgress > 0 && squad.edgeProgress < currentEdge.length);
  if (movingInsideEdge) {
    const currentFrom = squad.path?.nodeIds?.[squad.pathIndex] ?? null;
    const currentTo = squad.path?.nodeIds?.[squad.pathIndex + 1] ?? null;
    if (currentTo && routeMatchesGraph(state, normalized, currentTo, expectedDestinationNodeId)) {
      squad.path = {
        nodeIds: [currentFrom, ...normalized.nodeIds],
        edgeIds: [squad.edgeId, ...normalized.edgeIds],
        cost: Math.max(0, currentEdge.length - squad.edgeProgress) + normalized.cost,
        targetId: normalized.targetId
      };
      squad.pathIndex = 0;
      return true;
    }
    if (currentFrom && routeMatchesGraph(state, normalized, currentFrom, expectedDestinationNodeId)) {
      squad.path = {
        nodeIds: [currentTo, ...normalized.nodeIds],
        edgeIds: [squad.edgeId, ...normalized.edgeIds],
        cost: Math.max(0, squad.edgeProgress) + normalized.cost,
        targetId: normalized.targetId
      };
      squad.pathIndex = 0;
      squad.edgeProgress = Math.max(0, currentEdge.length - squad.edgeProgress);
      return true;
    }
    return false;
  }
  if (!routeMatchesGraph(state, normalized, squad.nodeId, expectedDestinationNodeId)) return false;
  squad.path = normalized;
  squad.pathIndex = 0;
  squad.edgeId = normalized.edgeIds[0] ?? null;
  squad.edgeProgress = 0;
  squad.nodeId = normalized.nodeIds[0] ?? squad.nodeId;
  return true;
}

function findFriendlyPathFromBestCurrentEdgeExit(state, squad, destinationNodeId) {
  const currentEdge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  const currentFrom = currentEdge ? squad.path?.nodeIds?.[squad.pathIndex] : null;
  const currentTo = currentEdge ? squad.path?.nodeIds?.[squad.pathIndex + 1] : null;
  if (!currentEdge || !(squad.edgeProgress > 0) || squad.edgeProgress >= currentEdge.length || !currentFrom || !currentTo) {
    return findFriendlyRoadPath(state, squad.nodeId, destinationNodeId);
  }
  let best = null;
  for (const option of [
    { nodeId: currentFrom, leadingDistance: Math.max(0, squad.edgeProgress) },
    { nodeId: currentTo, leadingDistance: Math.max(0, currentEdge.length - squad.edgeProgress) }
  ]) {
    const path = findFriendlyRoadPath(state, option.nodeId, destinationNodeId);
    if (!path) continue;
    const score = option.leadingDistance + Math.max(0, Number(path.cost) || 0);
    if (!best || score < best.score) best = { path, score };
  }
  return best?.path ?? null;
}

export function holdFriendlySquad(state, squadId, events = null) {
  const squad = friendlySquadById(state, squadId);
  if (!squad) return { ok: false, reason: 'Squad not found.' };
  if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
    return { ok: false, reason: 'Squads healing or idle at base cannot receive move orders.' };
  }
  if (squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW || squad.order === FRIENDLY_SQUAD_ORDER.RETURN) {
    return { ok: false, reason: 'Squads returning or withdrawing cannot be stopped.' };
  }
  if (squad.order !== FRIENDLY_SQUAD_ORDER.HOLD) {
    squad.heldOrder = squad.order;
    squad.heldDestinationNodeId = squad.commandDestinationNodeId;
  }
  squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
  if (squad.status !== FRIENDLY_SQUAD_STATUS.ENGAGED) squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
  events?.emit('friendly:squad-order', { squadId, order: squad.order });
  events?.emit('message', { text: 'Issued a stop order to the friendly squad.' });
  return { ok: true, squad };
}

export function issueFriendlyRouteOrder(state, squadId, { order, path, destinationNodeId }, events = null) {
  const squad = friendlySquadById(state, squadId);
  if (!squad) return { ok: false, reason: 'Squad not found.' };
  if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
    return { ok: false, reason: 'Squads healing or idle at base cannot receive route orders.' };
  }
  if (![FRIENDLY_SQUAD_ORDER.ADVANCE, FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(order)) {
    return { ok: false, reason: 'Invalid squad order.' };
  }
  if ([FRIENDLY_SQUAD_ORDER.WITHDRAW, FRIENDLY_SQUAD_ORDER.RETURN].includes(squad.order)) {
    return { ok: false, reason: 'Squads already withdrawing or returning cannot change mission.' };
  }
  let advanceTarget = null;
  if (order === FRIENDLY_SQUAD_ORDER.ADVANCE) {
    if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
      advanceTarget = (state.world?.recoveryItems ?? []).find(item => item.id === squad.targetRecoveryItemId && item.assignedSquadId === squad.id && [RECOVERY_ITEM_STATUS.RESERVED, RECOVERY_ITEM_STATUS.CARRIED].includes(item.status)) ?? null;
      if (!advanceTarget) return { ok: false, reason: 'Recovery target was lost. Please withdraw.' };
    } else if (squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT) {
      advanceTarget = currentTargetEnemy(state, squad);
      if (!advanceTarget) return { ok: false, reason: 'Interception target was lost. Please withdraw.' };
    } else {
      const targetId = squad.missionTargetBaseId ?? squad.targetBaseId;
      advanceTarget = state.world.enemyBases.find(base => base.id === targetId && base.alive && base.hp > 0) ?? null;
      if (!advanceTarget) return { ok: false, reason: 'Original attack target was lost. Please withdraw.' };
    }
  }
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    const origin = ownedBaseById(state, squad.originBaseId) ?? activePlayerBases(state)[0] ?? null;
    if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: 'No available return base.' };
  }
  if (!assignPathAtCurrentPosition(state, squad, path, destinationNodeId ?? path?.targetId ?? null)) return { ok: false, reason: "Cannot connect the selected route from the squad\'s current position." };
  if (advanceTarget && squad.missionType === FRIENDLY_SQUAD_MISSION.ATTACK) squad.targetBaseId = advanceTarget.id;
  if (advanceTarget && squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT) squad.targetEnemyId = advanceTarget.id;
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    if (squad.targetRecoveryItemId) releaseRecoveryItem(state, squad.targetRecoveryItemId, squad.id, squad.status === FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM ? friendlySquadPosition(state, squad) : null);
    squad.targetRecoveryItemId = null;
    squad.recoveryCollectionProgressSec = null;
    squad.targetBaseId = null;
    squad.missionTargetBaseId = null;
    squad.targetEnemyId = null;
  }
  squad.commandDestinationNodeId = destinationNodeId ?? path.targetId ?? null;
  if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY && order !== FRIENDLY_SQUAD_ORDER.HOLD) squad.recoveryCollectionProgressSec = null;
  squad.order = order;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.status = statusForOrder(order);
  squad.engagedEnemyId = null;
  events?.emit('friendly:squad-order', { squadId, order, destinationNodeId: squad.commandDestinationNodeId });
  const label = order === FRIENDLY_SQUAD_ORDER.RETREAT ? 'Retreat' : order === FRIENDLY_SQUAD_ORDER.WITHDRAW ? 'withdrawal' : 'advanceresume';
  events?.emit('message', { text: `friendly squad to ${label}order issue .` });
  return { ok: true, squad };
}

function activeReturnBaseForSquad(state, squad, preferredBaseId = squad.recoveryBaseId ?? squad.originBaseId) {
  const preferred = preferredBaseId ? ownedBaseById(state, preferredBaseId) : null;
  if (preferred && preferred.status === 'ESTABLISHED' && preferred.hp > 0) return preferred;
  const origin = squad.originBaseId ? ownedBaseById(state, squad.originBaseId) : null;
  if (origin && origin.status === 'ESTABLISHED' && origin.hp > 0) return origin;
  const recovery = squad.recoveryBaseId ? ownedBaseById(state, squad.recoveryBaseId) : null;
  if (recovery && recovery.status === 'ESTABLISHED' && recovery.hp > 0) return recovery;
  const major = activePlayerBases(state)[0] ?? null;
  if (major) return major;
  return deploymentBases(state, squad.type)[0] ?? activeOwnedBases(state)[0] ?? null;
}

function planReturn(state, squad) {
  const origin = activeReturnBaseForSquad(state, squad);
  if (!origin) return false;
  const path = findFriendlyPathFromBestCurrentEdgeExit(state, squad, origin.nodeId);
  if ([FRIENDLY_SQUAD_MISSION.ATTACK, FRIENDLY_SQUAD_MISSION.INTERCEPT].includes(squad.missionType)) {
    squad.targetBaseId = null;
    squad.missionTargetBaseId = null;
    squad.targetEnemyId = null;
  }
  squad.engagedEnemyId = null;
  squad.order = FRIENDLY_SQUAD_ORDER.RETURN;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.commandDestinationNodeId = origin.nodeId;
  squad.recoveryBaseId = origin.id;
  if (squad.originBaseId !== origin.id && !ownedBaseById(state, squad.originBaseId)) squad.originBaseId = origin.id;
  if (!path || !assignPathAtCurrentPosition(state, squad, path, origin.nodeId)) {
    squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
    squad.path = null;
    squad.edgeId = null;
    return false;
  }
  squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  return true;
}

function redirectRecoverySquadToMajorBase(state, squad, events = null) {
  const candidates = activePlayerBases(state)
    .map(base => ({ base, path: findFriendlyRoadPath(state, squad.nodeId, base.nodeId) }))
    .filter(candidate => candidate.path)
    .sort((a, b) => a.path.cost - b.path.cost);
  const fallback = candidates[0] ?? null;
  if (!fallback || !assignPathAtCurrentPosition(state, squad, fallback.path, fallback.base.nodeId)) {
    squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
    squad.path = null;
    squad.edgeId = null;
    squad.edgeProgress = 0;
    return false;
  }
  squad.originBaseId = fallback.base.id;
  squad.recoveryBaseId = fallback.base.id;
  squad.targetBaseId = null;
  squad.missionTargetBaseId = null;
  squad.targetEnemyId = null;
  squad.commandDestinationNodeId = fallback.base.nodeId;
  squad.order = FRIENDLY_SQUAD_ORDER.RETURN;
  squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.recoveryStartedAt = null;
  squad.reorganizationRemaining = 0;
  squad.readyAt = null;
  events?.emit('friendly:squad-recovery-relocated', { squadId: squad.id, baseId: fallback.base.id });
  events?.emit('message', { text: `recovery in progress of base, squad ${fallback.base.name} to evacuate.` });
  return true;
}


function dropSquadRecoveryItemOnRoad(state, squad, events = null, message = 'The recovery item was dropped on the road because no return base is available.') {
  const dropped = releaseSquadRecoveryItem(state, squad, true);
  if (!dropped) return null;
  events?.emit('friendly:recovery-item-dropped', { squadId: squad.id, itemId: dropped.id, position: recoveryItemPoint(state, dropped) });
  events?.emit('message', { text: message });
  return dropped;
}

function deactivateSquadAfterBaseLoss(state, squad, remove, events = null) {
  dropSquadRecoveryItemOnRoad(state, squad, events);
  clearEnemyEngagements(state, squad.id);
  remove.add(squad.id);
  events?.emit('friendly:squad-stranded-without-base', { squadId: squad.id, position: friendlySquadPosition(state, squad) });
}

export function stabilizeFriendlySquadsAfterOwnedBaseChanges(state, events = null) {
  ensureFriendlyForceState(state);
  const activeBases = activeOwnedBases(state);
  const remove = new Set();
  const result = { changed: false, removedSquads: 0, relocatedSquads: 0, droppedItems: 0, reroutedSquads: 0 };

  if (activeBases.length <= 0) {
    for (const squad of state.combat.friendlySquads ?? []) {
      if (dropSquadRecoveryItemOnRoad(state, squad, events, 'Home base was lost. The recovery item was dropped back onto the road.')) result.droppedItems += 1;
      clearEnemyEngagements(state, squad.id);
      remove.add(squad.id);
    }
    if (remove.size > 0) {
      state.combat.friendlySquads = state.combat.friendlySquads.filter(squad => !remove.has(squad.id));
      result.changed = true;
      result.removedSquads = remove.size;
    }
    return result;
  }

  for (const squad of state.combat.friendlySquads ?? []) {
    if (!squad?.id || squad.hp <= 0) continue;
    const originalOriginId = squad.originBaseId ?? null;
    const originalRecoveryId = squad.recoveryBaseId ?? null;
    const originActive = originalOriginId ? ownedBaseById(state, originalOriginId) : null;
    const recoveryActive = (originalRecoveryId ?? originalOriginId) ? ownedBaseById(state, originalRecoveryId ?? originalOriginId) : null;
    const needsRelocation = !originActive || !recoveryActive;
    if (!needsRelocation) continue;

    const fallback = activeReturnBaseForSquad(state, squad);
    if (!fallback) {
      const beforeTarget = squad.targetRecoveryItemId;
      deactivateSquadAfterBaseLoss(state, squad, remove, events);
      if (beforeTarget) result.droppedItems += 1;
      continue;
    }

    squad.originBaseId = fallback.id;
    squad.recoveryBaseId = fallback.id;
    result.changed = true;

    if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
      const recovery = beginFriendlyRecovery(state, squad, fallback.id);
      if (recovery.ok) {
        result.relocatedSquads += 1;
        events?.emit('friendly:squad-recovery-relocated', { squadId: squad.id, baseId: fallback.id });
        events?.emit('message', { text: 'Squad evacuated to a surviving base after its base was lost.' });
        continue;
      }
    }

    if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) {
      if (planReturn(state, squad)) {
        result.reroutedSquads += 1;
        events?.emit('friendly:squad-return-rerouted', { squadId: squad.id, baseId: fallback.id });
        continue;
      }
      if (dropSquadRecoveryItemOnRoad(state, squad, events, 'The return route was lost. The recovery item was dropped on the road.')) result.droppedItems += 1;
      squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
      squad.path = null;
      squad.edgeId = null;
      squad.edgeProgress = 0;
      continue;
    }

    squad.reroutePending = true;
  }

  if (remove.size > 0) {
    state.combat.friendlySquads = state.combat.friendlySquads.filter(squad => !remove.has(squad.id));
    result.changed = true;
    result.removedSquads = remove.size;
  }
  return result;
}

function currentTargetBase(state, squad) {
  return squad.targetBaseId
    ? state.world.enemyBases.find(base => base.id === squad.targetBaseId && base.alive && base.hp > 0) ?? null
    : null;
}

function currentTargetEnemy(state, squad) {
  return squad.targetEnemyId
    ? state.combat.enemies.find(enemy => enemy.id === squad.targetEnemyId && enemy.hp > 0 && enemy.departDelay <= 0) ?? null
    : null;
}

function replanIntercept(state, squad, target = currentTargetEnemy(state, squad)) {
  const destinationNodeId = enemyPursuitNodeId(state, target);
  if (!destinationNodeId) return false;
  if (squad.commandDestinationNodeId === destinationNodeId && (squad.path || squad.nodeId === destinationNodeId)) return true;
  const currentEdge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  const routeStart = currentEdge && squad.edgeProgress > 0 && squad.edgeProgress < currentEdge.length && squad.path?.nodeIds?.[squad.pathIndex + 1]
    ? squad.path.nodeIds[squad.pathIndex + 1]
    : squad.nodeId;
  squad.commandDestinationNodeId = destinationNodeId;
  if (routeStart === destinationNodeId) {
    if (!currentEdge || squad.edgeProgress <= 0 || squad.edgeProgress >= currentEdge.length) {
      squad.path = null;
      squad.edgeId = null;
      squad.edgeProgress = 0;
      squad.nodeId = destinationNodeId;
    }
    squad.status = FRIENDLY_SQUAD_STATUS.OUTBOUND;
    return true;
  }
  const path = findFriendlyRoadPath(state, routeStart, destinationNodeId);
  if (!path || !assignPathAtCurrentPosition(state, squad, path, destinationNodeId)) return false;
  squad.status = FRIENDLY_SQUAD_STATUS.OUTBOUND;
  return true;
}

function currentRecoveryItem(state, squad) {
  return squad.targetRecoveryItemId
    ? (state.world?.recoveryItems ?? []).find(item => item.id === squad.targetRecoveryItemId && item.assignedSquadId === squad.id) ?? null
    : null;
}

function recoveryDropPlacement(state, squad) {
  const point = friendlySquadPosition(state, squad);
  const edge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  let nodeId = squad.nodeId;
  if (edge) nodeId = squad.edgeProgress <= edge.length / 2 ? edge.a : edge.b;
  return { nodeId, x: point.x, y: point.y };
}

function releaseSquadRecoveryItem(state, squad, dropCarried = false) {
  const item = currentRecoveryItem(state, squad);
  if (!item) return null;
  const placement = dropCarried && item.status === RECOVERY_ITEM_STATUS.CARRIED ? recoveryDropPlacement(state, squad) : null;
  const released = releaseRecoveryItem(state, item.id, squad.id, placement);
  squad.targetRecoveryItemId = null;
  squad.recoveryCollectionProgressSec = null;
  return released.item ?? null;
}

function synchronizeCarriedItem(state, squad) {
  const item = currentRecoveryItem(state, squad);
  if (!item || item.status !== RECOVERY_ITEM_STATUS.CARRIED) return;
  const placement = recoveryDropPlacement(state, squad);
  item.nodeId = placement.nodeId;
  item.x = placement.x;
  item.y = placement.y;
}

function updateRecoveryCollection(state, squad, definition, deltaSeconds, events) {
  const item = currentRecoveryItem(state, squad);
  if (!item) { planReturn(state, squad); return; }
  if (item.status === RECOVERY_ITEM_STATUS.CARRIED) { planReturn(state, squad); return; }
  if (item.status !== RECOVERY_ITEM_STATUS.RESERVED) { releaseSquadRecoveryItem(state, squad); planReturn(state, squad); return; }
  squad.status = FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM;
  squad.recoveryCollectionProgressSec = Math.min(definition.collectionSeconds ?? SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS, (squad.recoveryCollectionProgressSec ?? 0) + deltaSeconds);
  if (squad.recoveryCollectionProgressSec < (definition.collectionSeconds ?? SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS)) return;
  const pickedUp = markRecoveryItemCarried(state, item.id, squad.id);
  if (!pickedUp.ok) { releaseSquadRecoveryItem(state, squad); planReturn(state, squad); return; }
  squad.recoveryCollectionProgressSec = null;
  events?.emit('friendly:recovery-item-picked-up', { squadId: squad.id, itemId: item.id });
  events?.emit('message', { text: `${recoveryItemPresentation(item).name} secured. Returning to base.` });
  planReturn(state, squad);
}

function acquireEnemy(state, squad, spatial, definition) {
  const position = friendlySquadPosition(state, squad);
  const priority = new Map((definition.targetPriorityTypes ?? []).map((type, index) => [type, index]));
  const candidates = spatial.query(position, definition.engagementRange)
    .filter(entry => entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((a, b) => {
      if (a.enemy.id === squad.targetEnemyId) return -1;
      if (b.enemy.id === squad.targetEnemyId) return 1;
      const rankA = priority.has(a.enemy.type) ? priority.get(a.enemy.type) : Number.MAX_SAFE_INTEGER;
      const rankB = priority.has(b.enemy.type) ? priority.get(b.enemy.type) : Number.MAX_SAFE_INTEGER;
      const riskA = squad.type === 'skirmisher' ? skirmisherTargetRisk(a.enemy) : 0;
      const riskB = squad.type === 'skirmisher' ? skirmisherTargetRisk(b.enemy) : 0;
      const distanceA = distanceSquared(a.position, position);
      const distanceB = distanceSquared(b.position, position);
      if (squad.type === 'skirmisher') return rankA - rankB || riskA - riskB || distanceA - distanceB;
      return rankA - rankB || distanceA - distanceB;
    });
  const target = candidates[0]?.enemy ?? null;
  squad.engagedEnemyId = target?.id ?? null;
  if (target) target.engagedSquadId = squad.id;
  return target;
}

function friendlyCommandBonuses(state, squad) {
  const point = friendlySquadPosition(state, squad);
  let attack = 0;
  let speed = 0;
  for (const commander of state.combat?.friendlySquads ?? []) {
    if (commander.id === squad.id || commander.type !== 'command' || commander.hp <= 0) continue;
    if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(commander.status)) continue;
    const definition = friendlySquadRuntimeDefinition(state, commander.type, commander);
    if (distanceSquared(point, friendlySquadPosition(state, commander)) > (definition.auraRange ?? 0) ** 2) continue;
    attack = Math.max(attack, Number(definition.commandAura) || 0);
    speed = Math.max(speed, Number(definition.speedAura) || 0);
  }
  return { attack, speed };
}


function friendlySquadLevelCap(state) {
  const civilizationLevel = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0));
  return Math.max(1, Math.min(5, 1 + civilizationLevel));
}

function awardFriendlySquadExperience(state, squad, amount, events = null) {
  if (!squad || squad.hp <= 0 || amount <= 0) return;
  squad.unitLevel = friendlySquadLevel(squad);
  if (squad.unitLevel >= 5) return;
  squad.unitXp = Math.max(0, Number(squad.unitXp) || 0) + amount;
  const levelCap = friendlySquadLevelCap(state);
  let leveled = false;
  while (squad.unitLevel < levelCap && squad.unitLevel < 5 && squad.unitXp >= friendlySquadXpForNextLevel(squad.unitLevel)) {
    squad.unitLevel += 1;
    leveled = true;
  }
  if (!leveled) return;
  const previousMaxHp = Math.max(1, Number(squad.maxHp) || 1);
  const previousRatio = Math.max(0, Math.min(1, Number(squad.hp) / previousMaxHp));
  const definition = friendlySquadRuntimeDefinition(state, squad.type, squad);
  squad.maxHp = definition.hp;
  squad.hp = Math.max(1, Math.min(squad.maxHp, Math.round(squad.maxHp * previousRatio)));
  events?.emit('friendly:squad-leveled', { squadId: squad.id, type: squad.type, unitLevel: squad.unitLevel });
  events?.emit('message', { text: `${friendlySquadDefinition(squad.type).name} reached Lv.${squad.unitLevel}.` });
}

function awardFriendlyCombatExperience(state, squad, { damage = 0, seconds = 0, enemyType = null, killed = 0, baseDamage = 0 } = {}, events = null) {
  if (!squad || squad.hp <= 0) return;
  let amount = 0;
  const activeSeconds = Math.max(0, Number(seconds) || 0);
  const dealtDamage = Math.max(0, Number(damage) || 0);
  const dealtBaseDamage = Math.max(0, Number(baseDamage) || 0);
  if (dealtDamage > 0) amount += Math.min(3.2, dealtDamage * 0.11) + activeSeconds * 0.55;
  if (dealtBaseDamage > 0) amount += Math.min(3.6, dealtBaseDamage * 0.10) + activeSeconds * 0.45;
  if (killed > 0) amount += Math.max(0, Number(killed) || 0) * (enemyType === 'scout' ? 9 : 13);
  const definition = friendlySquadDefinition(squad.type);
  if (squad.type === 'skirmisher' && enemyType && (definition.targetPriorityTypes ?? []).includes(enemyType)) amount *= 1.35;
  if (squad.type === 'siege' && dealtBaseDamage > 0) amount *= 1.25;
  awardFriendlySquadExperience(state, squad, amount, events);
}

function applyArtillerySplash(state, squad, definition, primaryEnemy, primaryDamage, spatial, events) {
  if (!(definition.splashRadius > 0) || !(definition.maxSplashTargets > 1)) return;
  const center = enemyPosition(state, primaryEnemy);
  const targets = spatial.query(center, definition.splashRadius)
    .filter(entry => entry.enemy.id !== primaryEnemy.id && entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((left, right) => distanceSquared(left.position, center) - distanceSquared(right.position, center))
    .slice(0, definition.maxSplashTargets - 1);
  for (const entry of targets) {
    const groupMultiplier = splashDamageMultiplierForGroup(entry.enemy, definition, { centered: false });
    const before = enemyUnitCount(entry.enemy);
    const beforeHp = Math.max(0, Number(entry.enemy.hpPool ?? entry.enemy.hp) || 0);
    damageEnemy(state, entry.enemy, primaryDamage * (definition.splashMultiplier ?? 0) * groupMultiplier, events, spatial);
    const afterHp = Math.max(0, Number(entry.enemy.hpPool ?? entry.enemy.hp) || 0);
    const killed = Math.max(0, before - enemyUnitCount(entry.enemy));
    awardFriendlyCombatExperience(state, squad, { damage: beforeHp - afterHp, seconds: 0, enemyType: entry.enemy.type, killed }, events);
  }
}

function updateEngagement(state, squad, definition, deltaSeconds, spatial, events) {
  let enemy = squad.engagedEnemyId ? state.combat.enemies.find(item => item.id === squad.engagedEnemyId && item.hp > 0) : null;
  const squadPoint = friendlySquadPosition(state, squad);
  const designated = squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT ? currentTargetEnemy(state, squad) : null;
  if (designated && distanceSquared(enemyPosition(state, designated), squadPoint) <= definition.engagementRange * definition.engagementRange) {
    if (enemy && enemy.id !== designated.id && enemy.engagedSquadId === squad.id) enemy.engagedSquadId = null;
    enemy = designated;
    squad.engagedEnemyId = designated.id;
    designated.engagedSquadId = squad.id;
  }
  if (enemy && distanceSquared(enemyPosition(state, enemy), squadPoint) > (definition.engagementRange + 5) ** 2) {
    if (enemy.engagedSquadId === squad.id) enemy.engagedSquadId = null;
    squad.engagedEnemyId = null;
    enemy = null;
  }
  enemy ??= acquireEnemy(state, squad, spatial, definition);
  if (!enemy) return false;
  if (shouldSkirmisherAutoWithdraw(squad, definition, enemy)) {
    if (enemy.engagedSquadId === squad.id) enemy.engagedSquadId = null;
    squad.engagedEnemyId = null;
    if (planReturn(state, squad)) {
      events?.emit('friendly:squad-auto-withdraw', { squadId: squad.id, enemyId: enemy.id });
      events?.emit('message', { text: 'Skirmisher Squad enemygroup from autoRetreat.' });
      return true;
    }
  }
  squad.status = FRIENDLY_SQUAD_STATUS.ENGAGED;
  squad.combatCooldown = Math.max(squad.combatCooldown ?? 0, definition.recoveryDelaySeconds ?? 0);
  const commandBonus = friendlyCommandBonuses(state, squad).attack;
  const primaryDamage = friendlySquadEnemyDamage(definition, enemy.type) * (1 + commandBonus) * deltaSeconds;
  applyArtillerySplash(state, squad, definition, enemy, primaryDamage, spatial, events);
  const beforeCount = enemyUnitCount(enemy);
  const beforeHp = Math.max(0, Number(enemy.hpPool ?? enemy.hp) || 0);
  damageEnemy(state, enemy, primaryDamage, events, spatial);
  const afterHp = Math.max(0, Number(enemy.hpPool ?? enemy.hp) || 0);
  const killed = Math.max(0, beforeCount - enemyUnitCount(enemy));
  awardFriendlyCombatExperience(state, squad, {
    damage: beforeHp - afterHp,
    seconds: deltaSeconds,
    enemyType: enemy.type,
    killed
  }, events);
  if (enemy.hp <= 0) squad.engagedEnemyId = null;
  return true;
}


function exposeEvasiveSquad(state, squad, definition, spatial) {
  const position = friendlySquadPosition(state, squad);
  const candidate = spatial.query(position, definition.engagementRange)
    .filter(entry => entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((a, b) => distanceSquared(a.position, position) - distanceSquared(b.position, position))[0]?.enemy ?? null;
  if (candidate && (!candidate.engagedSquadId || candidate.engagedSquadId === squad.id)) candidate.engagedSquadId = squad.id;
}


function updateNonCombatRecovery(squad, definition, deltaSeconds) {
  squad.combatCooldown = Math.max(0, (squad.combatCooldown ?? 0) - deltaSeconds);
  if (!(definition.nonCombatRecoveryPerSecond > 0)) return;
  if (squad.combatCooldown > 0 || squad.status === FRIENDLY_SQUAD_STATUS.ENGAGED || squad.status === FRIENDLY_SQUAD_STATUS.ATTACKING_BASE) return;
  squad.hp = Math.min(squad.maxHp, squad.hp + definition.nonCombatRecoveryPerSecond * deltaSeconds);
}

function advanceAlongPath(state, squad, definition, deltaSeconds) {
  if (!squad.path || !squad.edgeId) return { status: 'ARRIVED', remainingSeconds: Math.max(0, deltaSeconds) };
  const formationActive = Boolean(
    squad.formationId && squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE &&
    squad.missionType === FRIENDLY_SQUAD_MISSION.ATTACK &&
    state.world.enemyBases.some(base => base.id === squad.formationTargetId && base.alive && base.hp > 0)
  );
  const baseMovementSpeed = formationActive ? Math.min(definition.speed, squad.formationSpeed ?? definition.speed) : definition.speed;
  const nowMs = state.runtime?.worldTimeMs ?? Date.now();
  const activeRoadsideBoost = Number(squad.roadsideSpeedBoostUntil) > nowMs ? Math.max(0, Number(squad.roadsideSpeedBoostMultiplier) || 0) : 0;
  if (activeRoadsideBoost <= 0 && Number(squad.roadsideSpeedBoostUntil) > 0 && Number(squad.roadsideSpeedBoostUntil) <= nowMs) {
    squad.roadsideSpeedBoostUntil = 0;
    squad.roadsideSpeedBoostMultiplier = 0;
  }
  const movementSpeed = Math.max(0.001, baseMovementSpeed * (1 + friendlyCommandBonuses(state, squad).speed + activeRoadsideBoost));
  let remainingSeconds = Math.max(0, Number(deltaSeconds) || 0);
  let transitions = 0;
  while (squad.path && squad.edgeId && remainingSeconds > 1e-9 && transitions < 4096) {
    const edge = state.world.roadGraph.edgeById.get(squad.edgeId);
    if (!edge) return { status: 'BROKEN', remainingSeconds };
    const remainingDistance = Math.max(0, edge.length - squad.edgeProgress);
    const timeToNode = remainingDistance / movementSpeed;
    if (remainingSeconds + 1e-9 < timeToNode) {
      squad.edgeProgress += movementSpeed * remainingSeconds;
      return { status: 'MOVING', remainingSeconds: 0 };
    }
    remainingSeconds = Math.max(0, remainingSeconds - timeToNode);
    squad.nodeId = squad.path.nodeIds[squad.pathIndex + 1];
    appendHistory(squad, squad.nodeId);
    squad.pathIndex += 1;
    squad.edgeProgress = 0;
    transitions += 1;
    if (squad.pathIndex >= squad.path.edgeIds.length) {
      squad.edgeId = null;
      return { status: 'ARRIVED', remainingSeconds };
    }
    squad.edgeId = squad.path.edgeIds[squad.pathIndex];
  }
  return { status: squad.edgeId ? 'MOVING' : 'ARRIVED', remainingSeconds };
}

function attackEnemyBase(state, squad, definition, deltaSeconds, events) {
  const target = currentTargetBase(state, squad);
  if (!target) {
    planReturn(state, squad);
    return;
  }
  squad.status = FRIENDLY_SQUAD_STATUS.ATTACKING_BASE;
  squad.combatCooldown = Math.max(squad.combatCooldown ?? 0, definition.recoveryDelaySeconds ?? 0);
  spawnEnemyBaseGuard(state, target, events);
  const beforeHp = Math.max(0, Number(target.hp) || 0);
  target.hp = Math.max(0, target.hp - definition.baseDps * deltaSeconds);
  const baseDamage = Math.max(0, beforeHp - Math.max(0, Number(target.hp) || 0));
  awardFriendlyCombatExperience(state, squad, { baseDamage, seconds: deltaSeconds }, events);
  if (target.hp > 0) return;
  awardFriendlySquadExperience(state, squad, 18, events);
  destroyEnemyBase(state, target, events, { squadId: squad.id });
  planReturn(state, squad);
}

function currentOrderDestinationNodeId(state, squad) {
  if (squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE) return squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
    ? currentRecoveryItem(state, squad)?.nodeId ?? null
    : squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT
      ? enemyPursuitNodeId(state, currentTargetEnemy(state, squad))
      : currentTargetBase(state, squad)?.nodeId ?? null;
  if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) {
    return activeReturnBaseForSquad(state, squad)?.nodeId ?? null;
  }
  if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) return squad.commandDestinationNodeId;
  return null;
}

function routeNeedsBarrierReroute(squad, blockedEdgeIds) {
  if (!squad.path?.edgeIds?.length) return false;
  for (let index = Math.max(0, squad.pathIndex ?? 0); index < squad.path.edgeIds.length; index += 1) {
    if (blockedEdgeIds.has(squad.path.edgeIds[index])) return true;
  }
  return false;
}

function rerouteFriendlySquadAroundBarriers(state, squad) {
  const blockedEdgeIds = activeFriendlyBarrierEdgeIds(state);
  const forcedReroute = Boolean(squad.reroutePending);
  const barrierBlocksRoute = routeNeedsBarrierReroute(squad, blockedEdgeIds);
  if (!barrierBlocksRoute && !forcedReroute) {
    squad.reroutePending = false;
    return true;
  }
  squad.reroutePending = false;
  if ([FRIENDLY_SQUAD_ORDER.HOLD].includes(squad.order)) return true;
  const targetNodeId = currentOrderDestinationNodeId(state, squad);
  if (!targetNodeId) return true;
  const path = findFriendlyPathFromBestCurrentEdgeExit(state, squad, targetNodeId);
  if (!path || !assignPathAtCurrentPosition(state, squad, path, targetNodeId)) {
    squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
    squad.path = null;
    squad.edgeId = null;
    squad.edgeProgress = 0;
    return false;
  }
  squad.commandDestinationNodeId = targetNodeId;
  squad.status = statusForOrder(squad.order);
  return true;
}

function replanStranded(state, squad) {
  let targetNodeId = null;
  if (squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE) targetNodeId = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
    ? currentRecoveryItem(state, squad)?.nodeId ?? null
    : squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT
      ? enemyPursuitNodeId(state, currentTargetEnemy(state, squad))
      : currentTargetBase(state, squad)?.nodeId ?? null;
  if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) targetNodeId = activeReturnBaseForSquad(state, squad)?.nodeId ?? null;
  if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) targetNodeId = squad.commandDestinationNodeId;
  if (!targetNodeId) return false;
  const path = findFriendlyRoadPath(state, squad.nodeId, targetNodeId);
  if (!path) return false;
  squad.path = normalizePath(path);
  squad.pathIndex = 0;
  squad.edgeId = path.edgeIds[0] ?? null;
  squad.edgeProgress = 0;
  squad.status = statusForOrder(squad.order);
  return true;
}

export function repairNearbyDefenseWithEngineer(state, squadId, events = null) {
  ensureFriendlyForceState(state);
  const squad = friendlySquadById(state, squadId);
  if (!squad || squad.type !== 'engineer') return { ok: false, reason: 'Select an Engineer Squad.' };
  if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) return { ok: false, reason: 'Only deployed Engineer Squads can perform field repair.' };
  const definition = friendlySquadRuntimeDefinition(state, squad.type, squad);
  const point = friendlySquadPosition(state, squad);
  const target = (state.combat?.defenses ?? [])
    .filter(defense => defense.hp > 0 && defense.hp < defense.maxHp && distanceSquared(point, defense.position) <= definition.repairRange * definition.repairRange)
    .sort((left, right) => (left.hp / left.maxHp) - (right.hp / right.maxHp) || distanceSquared(point, left.position) - distanceSquared(point, right.position))[0] ?? null;
  if (!target) return { ok: false, reason: `No repairable facility is available within ${definition.repairRange} m.` };
  const repairHp = Math.min(definition.repairAmount, target.maxHp - target.hp);
  const cost = repairCostForDefense(target, repairHp);
  const missing = missingBundle(state, cost);
  if (Object.keys(missing).length) return { ok: false, reason: 'Resources required for field repair are insufficient.', missing, cost, target };
  if (!consumeBundle(state, cost)) return { ok: false, reason: 'Resources were missing when field repair was confirmed.' };
  target.hp = Math.min(target.maxHp, target.hp + repairHp);
  state.statistics.totalRepairHpPaid = (state.statistics.totalRepairHpPaid ?? 0) + repairHp;
  events?.emit('friendly:engineer-repair', { squadId, defenseId: target.id, repairHp, cost });
  events?.emit('message', { text: `Engineer Squad ${Math.round(repairHp)}HP fieldRepair .` });
  return { ok: true, target, repairHp, cost };
}


function primaryRecoveryBaseId(state) {
  const primary = activePlayerBases(state).find(base => base.primary && base.hp > 0) ?? activePlayerBases(state).find(base => base.hp > 0) ?? state.world?.homeBase ?? null;
  return primary?.id ?? null;
}

function annihilationRecoverySeconds(squad) {
  const definition = FRIENDLY_SQUAD_DEFINITIONS[squad.type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
  const base = FRIENDLY_ANNIHILATION_RECOVERY_SECONDS[definition.type] ?? 420;
  const levelBonus = Math.max(0, Math.floor(Number(definition.unlockLevel) || 0)) * 30;
  return base + levelBonus;
}

function beginAnnihilationRecovery(state, squad, events = null) {
  const dropped = releaseSquadRecoveryItem(state, squad, true);
  if (dropped) {
    events?.emit('friendly:recovery-item-dropped', { squadId: squad.id, itemId: dropped.id, position: recoveryItemPoint(state, dropped) });
    events?.emit('message', { text: 'The recovery squad was wiped out, leaving the special item on the road.' });
  }
  const baseId = squad.originBaseId ?? primaryRecoveryBaseId(state);
  squad.hp = 1;
  squad.maxHp = Math.max(1, Number(squad.maxHp) || friendlySquadRuntimeDefinition(state, squad.type, squad).hp);
  squad.path = null;
  squad.edgeId = null;
  squad.edgeProgress = 0;
  squad.engagedEnemyId = null;
  squad.targetEnemyId = null;
  squad.targetBaseId = null;
  squad.missionTargetBaseId = null;
  squad.targetRecoveryItemId = null;
  squad.recoveryCollectionProgressSec = null;
  squad.annihilatedRecovery = true;
  squad.annihilatedAt = state.runtime?.worldTimeMs ?? Date.now();
  const recovery = beginFriendlyRecovery(state, squad, baseId);
  if (!recovery.ok) {
    squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
    squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
    return recovery;
  }
  squad.reorganizationRemaining = Math.max(squad.reorganizationRemaining ?? 0, annihilationRecoverySeconds(squad));
  events?.emit('friendly:squad-annihilated', { squadId: squad.id, originBaseId: baseId, recoverySeconds: squad.reorganizationRemaining });
  events?.emit('message', { text: `${friendlySquadDefinition(squad.type).name}  was wiped out. entered long-term reorganization while still occupying a squad slot.` });
  return { ok: true, squad, recovery };
}

function canUseRoadsideSquadItem(squad, { allowTemporary = true } = {}) {
  return squad
    && squad.hp > 0
    && (allowTemporary || !squad.temporaryDeployment)
    && ![FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status);
}

function applyEmergencyWithdraw(state, squad, events = null) {
  if (!canUseRoadsideSquadItem(squad, { allowTemporary: false })) return { ok: false, reason: 'No normal friendly squad is available for withdrawal.' };
  clearEnemyEngagements(state, squad.id);
  squad.engagedEnemyId = null;
  if (!planReturn(state, squad)) return { ok: false, reason: 'Could not secure a withdrawal route.' };
  squad.order = FRIENDLY_SQUAD_ORDER.WITHDRAW;
  squad.status = FRIENDLY_SQUAD_STATUS.WITHDRAWING;
  events?.emit('friendly:squad-emergency-withdraw', { squadId: squad.id });
  events?.emit('message', { text: `${friendlySquadDefinition(squad.type).name} withdrawal.reorganization avoid.` });
  return { ok: true, squad };
}

function applySpeedBoostToSquads(state, targets, durationSeconds, multiplier = ROADSIDE_SPEED_BOOST_MULTIPLIER, events = null) {
  const activeTargets = targets.filter(squad => canUseRoadsideSquadItem(squad));
  if (!activeTargets.length) return { ok: false, reason: 'No friendly squad can be accelerated.' };
  const now = state.runtime?.worldTimeMs ?? Date.now();
  for (const squad of activeTargets) {
    squad.roadsideSpeedBoostUntil = Math.max(Number(squad.roadsideSpeedBoostUntil) || 0, now + Math.max(1, Number(durationSeconds) || 1) * 1000);
    squad.roadsideSpeedBoostMultiplier = Math.max(Number(squad.roadsideSpeedBoostMultiplier) || 0, Math.max(0, Number(multiplier) || 0));
  }
  events?.emit('friendly:squad-speed-boosted', { squadIds: activeTargets.map(squad => squad.id), durationSeconds, multiplier });
  events?.emit('message', { text: `March Banner boosted ${activeTargets.length} friendly squad(s).` });
  return { ok: true, squads: activeTargets };
}

export function emergencyWithdrawFriendlySquadById(state, squadId, events = null) {
  const squad = (state.combat?.friendlySquads ?? []).find(item => item.id === squadId) ?? null;
  if (!squad) return { ok: false, reason: 'Selected friendly squad was not found.' };
  return applyEmergencyWithdraw(state, squad, events);
}

export function emergencyWithdrawFriendlySquadNear(state, point, radiusMeters, events = null) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return { ok: false, reason: 'Acquire your current location.' };
  const radius2 = Math.max(0, Number(radiusMeters) || 0) ** 2;
  const candidates = (state.combat?.friendlySquads ?? [])
    .filter(squad => canUseRoadsideSquadItem(squad, { allowTemporary: false }))
    .map(squad => ({ squad, d2: distanceSquared(friendlySquadPosition(state, squad), point) }))
    .filter(entry => entry.d2 <= radius2)
    .sort((a, b) => {
      const aPriority = [FRIENDLY_SQUAD_STATUS.ENGAGED, FRIENDLY_SQUAD_STATUS.ATTACKING_BASE].includes(a.squad.status) ? 0 : 1;
      const bPriority = [FRIENDLY_SQUAD_STATUS.ENGAGED, FRIENDLY_SQUAD_STATUS.ATTACKING_BASE].includes(b.squad.status) ? 0 : 1;
      return aPriority - bPriority || a.d2 - b.d2;
    });
  const squad = candidates[0]?.squad ?? null;
  if (!squad) return { ok: false, reason: `No friendly squad available for withdrawal within ${Math.round(radiusMeters)} m.` };
  return applyEmergencyWithdraw(state, squad, events);
}

export function boostFriendlySquadById(state, squadId, durationSeconds, multiplier = ROADSIDE_SPEED_BOOST_MULTIPLIER, events = null) {
  const squad = (state.combat?.friendlySquads ?? []).find(item => item.id === squadId) ?? null;
  if (!squad) return { ok: false, reason: 'Selected friendly squad was not found.' };
  return applySpeedBoostToSquads(state, [squad], durationSeconds, multiplier, events);
}

export function boostFriendlySquadsNear(state, point, radiusMeters, durationSeconds, multiplier = ROADSIDE_SPEED_BOOST_MULTIPLIER, events = null) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return { ok: false, reason: 'Acquire your current location.' };
  const radius2 = Math.max(0, Number(radiusMeters) || 0) ** 2;
  const targets = (state.combat?.friendlySquads ?? [])
    .filter(squad => canUseRoadsideSquadItem(squad))
    .map(squad => ({ squad, d2: distanceSquared(friendlySquadPosition(state, squad), point) }))
    .filter(entry => entry.d2 <= radius2)
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, 3)
    .map(entry => entry.squad);
  if (!targets.length) return { ok: false, reason: `No friendly squad can be accelerated within ${Math.round(radiusMeters)} m.` };
  return applySpeedBoostToSquads(state, targets, durationSeconds, multiplier, events);
}

export class FriendlyForceSystem {
  constructor(events = null) {
    this.events = events;
  }

  previewDeployment(state, originBaseId, targetId, squadType = 'assault', targetKind = 'enemyBase', routeOverride = null) {
    return previewFriendlyDeployment(state, squadType, originBaseId, targetId, null, targetKind, routeOverride);
  }

  dispatch(state, originBaseId, targetId, squadType = 'assault', targetKind = 'enemyBase', routeOverride = null) {
    return dispatchFriendlySquad(state, squadType, originBaseId, targetId, this.events, targetKind, routeOverride);
  }

  previewCoordinatedDeployment(state, targetBaseId, squadTypes, options = null) {
    return previewCoordinatedDeployment(state, targetBaseId, squadTypes, options);
  }

  dispatchCoordinated(state, targetBaseId, squadTypes, options = null) {
    return dispatchCoordinatedSquads(state, targetBaseId, squadTypes, this.events, options);
  }

  hold(state, squadId) {
    return holdFriendlySquad(state, squadId, this.events);
  }

  repairNearby(state, squadId) {
    return repairNearbyDefenseWithEngineer(state, squadId, this.events);
  }

  issueRouteOrder(state, squadId, order) {
    return issueFriendlyRouteOrder(state, squadId, order, this.events);
  }

  update(state, deltaSeconds, spatial, shouldUpdate = null) {
    stabilizeFriendlySquadsAfterOwnedBaseChanges(state, this.events);
    const remove = new Set();
    for (const squad of state.combat.friendlySquads) {
      if (squad.hp <= 0) {
        if (squad.temporaryDeployment || friendlySquadRuntimeDefinition(state, squad.type, squad).missionKind === 'RECOVERY') {
          const dropped = releaseSquadRecoveryItem(state, squad, true);
          if (dropped) {
            this.events?.emit('friendly:recovery-item-dropped', { squadId: squad.id, itemId: dropped.id, position: recoveryItemPoint(state, dropped) });
            this.events?.emit('message', { text: 'The local dispatch squad was wiped out, leaving the special item on the road.' });
          }
          remove.add(squad.id);
          this.events?.emit('message', { text: squad.temporaryDeployment ? `${friendlySquadDefinition(squad.type).name} was wiped out and ended its local dispatch mission.` : `${friendlySquadDefinition(squad.type).name}  was wiped out.` });
        } else {
          beginAnnihilationRecovery(state, squad, this.events);
        }
        continue;
      }
      if (shouldUpdate && !shouldUpdate(squad)) continue;
      const definition = friendlySquadRuntimeDefinition(state, squad.type, squad);
      synchronizeCarriedItem(state, squad);
      if (squad.status === FRIENDLY_SQUAD_STATUS.READY) continue;
      if (squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING) {
        const recovery = updateFriendlyRecovery(state, squad, deltaSeconds, this.events);
        if (recovery.stranded) redirectRecoverySquadToMajorBase(state, squad, this.events);
        continue;
      }
      let activeSeconds = Math.max(0, Number(deltaSeconds) || 0);
      if (squad.departDelay > 0) {
        const waitingSeconds = Math.min(squad.departDelay, activeSeconds);
        squad.departDelay = Math.max(0, squad.departDelay - waitingSeconds);
        activeSeconds -= waitingSeconds;
        if (activeSeconds <= 1e-9) continue;
      }

      if (!rerouteFriendlySquadAroundBarriers(state, squad)) continue;

      if (squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT && squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE) {
        const target = currentTargetEnemy(state, squad);
        if (!target) {
          planReturn(state, squad);
          continue;
        }
        const destinationNodeId = enemyPursuitNodeId(state, target);
        if (destinationNodeId && (squad.commandDestinationNodeId !== destinationNodeId || (!squad.path && squad.nodeId !== destinationNodeId))) {
          if (!replanIntercept(state, squad, target)) {
            squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
            squad.path = null;
            squad.edgeId = null;
            continue;
          }
        }
      }

      const evasive = [FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order);
      if (evasive) exposeEvasiveSquad(state, squad, definition, spatial);
      if (!evasive && updateEngagement(state, squad, definition, activeSeconds, spatial, this.events)) continue;
      if (squad.status === FRIENDLY_SQUAD_STATUS.ENGAGED) squad.status = statusForOrder(squad.order);
      updateNonCombatRecovery(squad, definition, activeSeconds);

      if (squad.order === FRIENDLY_SQUAD_ORDER.HOLD) {
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
          if (squad.targetRecoveryItemId && !currentRecoveryItem(state, squad)) planReturn(state, squad);
        } else if (squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT) {
          if (squad.targetEnemyId && !currentTargetEnemy(state, squad)) planReturn(state, squad);
        } else {
          const missionId = squad.missionTargetBaseId ?? squad.targetBaseId;
          if (missionId && !state.world.enemyBases.some(base => base.id === missionId && base.alive && base.hp > 0)) planReturn(state, squad);
        }
        continue;
      }

      if (squad.recoveryCollectionProgressSec != null || squad.status === FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM) {
        updateRecoveryCollection(state, squad, definition, activeSeconds, this.events);
        continue;
      }

      if (squad.status === FRIENDLY_SQUAD_STATUS.ATTACKING_BASE) {
        attackEnemyBase(state, squad, definition, activeSeconds, this.events);
        continue;
      }
      if (squad.status === FRIENDLY_SQUAD_STATUS.STRANDED) {
        replanStranded(state, squad);
        continue;
      }

      const movement = advanceAlongPath(state, squad, definition, activeSeconds);
      if (movement.status === 'BROKEN') {
        squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
        squad.path = null;
        squad.edgeId = null;
        continue;
      }
      if (movement.status !== 'ARRIVED') continue;

      if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) {
        clearEnemyEngagements(state, squad.id);
        const recoveryBaseId = squad.recoveryBaseId ?? squad.originBaseId;
        if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY && squad.targetRecoveryItemId) {
          const item = currentRecoveryItem(state, squad);
          if (item?.status === RECOVERY_ITEM_STATUS.CARRIED) {
            const delivered = deliverRecoveryItem(state, item.id, squad.id);
            if (delivered.ok) {
              this.events?.emit('exploration:recovery-collected', delivered);
              const presentation = recoveryItemPresentation(item);
              const lootText = Object.keys(delivered.loot ?? {}).length ? `resources: ${presentation.lootText}.` : '';
              this.events?.emit('message', { text: `${presentation.name} base to bring back.${lootText}` });
            }
          } else releaseSquadRecoveryItem(state, squad);
          squad.targetRecoveryItemId = null;
          squad.recoveryCollectionProgressSec = null;
        }
        if (squad.temporaryDeployment) {
          remove.add(squad.id);
          this.events?.emit('friendly:squad-returned', { squadId: squad.id, originBaseId: recoveryBaseId, hp: squad.hp, temporary: true });
          this.events?.emit('message', { text: `${friendlySquadDefinition(squad.type).name} completed its local dispatch mission and disbanded.` });
          continue;
        }
        const recovery = beginFriendlyRecovery(state, squad, recoveryBaseId);
        if (!recovery.ok) {
          squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
          squad.path = null;
          squad.edgeId = null;
          continue;
        }
        this.events?.emit('friendly:squad-returned', { squadId: squad.id, originBaseId: recoveryBaseId, hp: squad.hp, withdrawal: squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW });
        this.events?.emit('message', { text: recovery.profile?.kind === 'MAJOR'
          ? 'squad Major Base to Return , supply · healing · reorganization start .'
          : 'squad Simple Base to Return , reorganization start .healing has healingFacilities of in range with  of waiting  more.' });
      } else if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) {
        squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
        squad.heldOrder = FRIENDLY_SQUAD_ORDER.ADVANCE;
        squad.heldDestinationNodeId = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
          ? currentRecoveryItem(state, squad)?.nodeId ?? null
          : squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT
            ? enemyPursuitNodeId(state, currentTargetEnemy(state, squad))
            : state.world.enemyBases.find(base => base.id === (squad.missionTargetBaseId ?? squad.targetBaseId) && base.alive && base.hp > 0)?.nodeId ?? null;
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        this.events?.emit('message', { text: 'friendly squad fell back to the specified point and stopped.' });
      } else if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        squad.recoveryCollectionProgressSec = 0;
        updateRecoveryCollection(state, squad, definition, movement.remainingSeconds, this.events);
      } else if (squad.missionType === FRIENDLY_SQUAD_MISSION.INTERCEPT) {
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        const target = currentTargetEnemy(state, squad);
        if (!target) planReturn(state, squad);
        else if (!replanIntercept(state, squad, target)) {
          squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
        }
      } else {
        attackEnemyBase(state, squad, definition, movement.remainingSeconds, this.events);
      }
    }
    if (remove.size) state.combat.friendlySquads = state.combat.friendlySquads.filter(squad => !remove.has(squad.id));
  }
}
