import { consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { activePlayerBases, ensurePlayerBaseState } from '../base/player-bases.js';
import { deploymentBases, ensureFieldBaseState, ownedBaseById } from '../base/field-bases.js';
import { distance, stableId } from '../core/utilities.js';
import { findRoadPath } from './routing-system.js';
import { damageEnemy, enemyPosition } from './enemy-system.js';
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
  friendlySquadEnemyDamage,
  friendlySquadUnlocked
} from './friendly-force-definitions.js';
import {
  RECOVERY_ITEM_STATUS,
  SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS,
  deliverRecoveryItem,
  ensureRecoveryState,
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

export const FRIENDLY_SQUAD_MISSION = Object.freeze({ ATTACK: 'ATTACK', RECOVERY: 'RECOVERY' });

export const FRIENDLY_SQUAD_ORDER = Object.freeze({
  ADVANCE: 'ADVANCE',
  HOLD: 'HOLD',
  RETREAT: 'RETREAT',
  WITHDRAW: 'WITHDRAW',
  RETURN: 'RETURN'
});

const MAX_ACTIVE_SQUADS_PER_BASE = 1;
const VALID_STATUS = new Set(Object.values(FRIENDLY_SQUAD_STATUS));
const VALID_ORDER = new Set(Object.values(FRIENDLY_SQUAD_ORDER));

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

export function ensureFriendlyForceState(state) {
  ensurePlayerBaseState(state);
  ensureFieldBaseState(state);
  state.combat.friendlySquads = Array.isArray(state.combat.friendlySquads) ? state.combat.friendlySquads : [];
  for (const squad of state.combat.friendlySquads) {
    const definition = friendlySquadDefinition(squad.type);
    squad.type = definition.type;
    squad.maxHp = Math.max(1, Number(squad.maxHp) || definition.hp);
    squad.hp = Math.max(0, Math.min(squad.maxHp, Number(squad.hp ?? squad.maxHp) || 0));
    squad.status = VALID_STATUS.has(squad.status) ? squad.status : FRIENDLY_SQUAD_STATUS.OUTBOUND;
    squad.order = VALID_ORDER.has(squad.order)
      ? squad.order
      : squad.status === FRIENDLY_SQUAD_STATUS.RETURNING
        ? FRIENDLY_SQUAD_ORDER.RETURN
        : FRIENDLY_SQUAD_ORDER.ADVANCE;
    squad.missionType = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY || definition.missionKind === 'RECOVERY'
      ? FRIENDLY_SQUAD_MISSION.RECOVERY
      : FRIENDLY_SQUAD_MISSION.ATTACK;
    squad.missionTargetBaseId ??= squad.targetBaseId ?? null;
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
    squad.engagedEnemyId ??= null;
    squad.path = normalizePath(squad.path);
    squad.travelHistoryNodeIds = Array.isArray(squad.travelHistoryNodeIds) && squad.travelHistoryNodeIds.length
      ? [...squad.travelHistoryNodeIds]
      : [squad.nodeId].filter(Boolean);
    squad.recoveryBaseId ??= null;
    squad.recoveryStartedAt = Number(squad.recoveryStartedAt) || null;
    squad.reorganizationRemaining = Math.max(0, Number(squad.reorganizationRemaining) || 0);
    squad.recoveryTargetHp = Math.max(squad.hp, Math.min(squad.maxHp, Number(squad.recoveryTargetHp) || squad.hp));
    squad.recoveryFacilityType ??= null;
    squad.recoveryFacilityId ??= null;
    squad.readyAt = Number(squad.readyAt) || null;
  }
  return state.combat.friendlySquads;
}

export function friendlySquadPosition(state, squad) {
  return roadUnitPosition(state, squad);
}

export function friendlySquadById(state, squadId) {
  return ensureFriendlyForceState(state).find(squad => squad.id === squadId && squad.hp > 0) ?? null;
}

function squadsFromBase(state, baseId) {
  return ensureFriendlyForceState(state).filter(squad => squad.originBaseId === baseId && squad.hp > 0);
}

function activeSquadsFromBase(state, baseId) {
  return squadsFromBase(state, baseId).filter(squad => ![FRIENDLY_SQUAD_STATUS.READY, FRIENDLY_SQUAD_STATUS.RECOVERING].includes(squad.status)).length;
}

function garrisonSquadFromBase(state, baseId) {
  return squadsFromBase(state, baseId).find(squad => [FRIENDLY_SQUAD_STATUS.READY, FRIENDLY_SQUAD_STATUS.RECOVERING].includes(squad.status)) ?? null;
}

function deploymentTarget(state, definition, targetId) {
  if (definition.missionKind === 'RECOVERY') {
    if (state.world.recoveryCollection?.itemId === targetId) return null;
    const item = ensureRecoveryState(state).find(value => value.id === targetId && value.status === RECOVERY_ITEM_STATUS.AVAILABLE) ?? null;
    return item ? { target: item, nodeId: item.nodeId, missionType: FRIENDLY_SQUAD_MISSION.RECOVERY } : null;
  }
  const base = state.world.enemyBases.find(value => value.id === targetId && value.alive && value.hp > 0) ?? null;
  return base ? { target: base, nodeId: base.nodeId, missionType: FRIENDLY_SQUAD_MISSION.ATTACK } : null;
}

export function previewFriendlyDeployment(state, squadType, originBaseId, targetId) {
  ensureFriendlyForceState(state);
  const definition = FRIENDLY_SQUAD_DEFINITIONS[squadType];
  if (!definition) return { ok: false, reason: '選択した部隊種類は存在しません。' };
  if (!friendlySquadUnlocked(state, squadType)) return { ok: false, reason: `${definition.name}は文明Lv.${definition.unlockLevel}で解禁されます。`, definition };
  const origin = ownedBaseById(state, originBaseId);
  if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: '出撃可能な拠点ではありません。', definition };
  if (!deploymentBases(state, squadType).some(base => base.id === origin.id)) return { ok: false, reason: `この拠点から${definition.name}は派兵できません。`, definition };
  const resolved = deploymentTarget(state, definition, targetId);
  if (!resolved) return { ok: false, reason: definition.missionKind === 'RECOVERY' ? '回収可能な特殊アイテムではありません。' : '攻撃可能な敵拠点ではありません。', definition };
  if (activeSquadsFromBase(state, origin.id) >= MAX_ACTIVE_SQUADS_PER_BASE) return { ok: false, reason: 'この拠点は既に部隊を派遣しています。', definition };
  const garrison = garrisonSquadFromBase(state, origin.id);
  if (garrison?.status === FRIENDLY_SQUAD_STATUS.RECOVERING) {
    const recovery = recoveryPresentation(state, garrison);
    return { ok: false, reason: `帰還部隊を回復・再編成中です（残り約${Math.ceil(recovery.reorganizationRemaining)}秒）。`, definition, garrison, recovery };
  }
  const path = findRoadPath(state, origin.nodeId, resolved.nodeId);
  if (!path) return { ok: false, reason: definition.missionKind === 'RECOVERY' ? '回収地点へ到達できる道路経路がありません。' : '敵拠点へ到達できる道路経路がありません。', definition };
  const reuseReadySquad = garrison?.status === FRIENDLY_SQUAD_STATUS.READY && garrison.type === squadType;
  const replaceReadySquad = garrison?.status === FRIENDLY_SQUAD_STATUS.READY && garrison.type !== squadType;
  const deploymentCost = reuseReadySquad ? {} : definition.cost;
  const missing = missingBundle(state, deploymentCost);
  return {
    ok: Object.keys(missing).length === 0,
    reason: Object.keys(missing).length ? '派兵に必要な資源が不足しています。' : null,
    origin,
    target: resolved.target,
    missionType: resolved.missionType,
    path,
    routeDistance: path.cost,
    cost: { ...deploymentCost },
    missing,
    definition,
    garrison,
    reuseReadySquad,
    replaceReadySquad
  };
}

export function dispatchFriendlySquad(state, squadType, originBaseId, targetId, events = null) {
  const preview = previewFriendlyDeployment(state, squadType, originBaseId, targetId);
  if (!preview.ok) return preview;

  const definition = preview.definition;
  const worldTime = state.runtime?.worldTimeMs ?? Date.now();
  const squadId = preview.reuseReadySquad && preview.garrison
    ? preview.garrison.id
    : stableId('friendly_squad', definition.type, originBaseId, targetId, worldTime, state.combat.friendlySquads.length);

  let reservation = null;
  if (preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
    reservation = reserveRecoveryItem(state, targetId, squadId);
    if (!reservation.ok) return reservation;
  }

  if (!consumeBundle(state, preview.cost)) {
    if (reservation) releaseRecoveryItem(state, targetId, squadId);
    return { ok: false, reason: '派兵確定時に資源が不足しました。' };
  }

  if (preview.replaceReadySquad && preview.garrison) {
    state.combat.friendlySquads = state.combat.friendlySquads.filter(item => item.id !== preview.garrison.id);
  }
  const squad = preview.reuseReadySquad && preview.garrison ? preview.garrison : {
    id: squadId,
    type: definition.type, hp: definition.hp, maxHp: definition.hp, members: definition.members, originBaseId, deployedAt: worldTime
  };
  Object.assign(squad, {
    type: definition.type,
    members: definition.members,
    missionType: preview.missionType,
    originBaseId,
    targetBaseId: preview.missionType === FRIENDLY_SQUAD_MISSION.ATTACK ? targetId : null,
    missionTargetBaseId: preview.missionType === FRIENDLY_SQUAD_MISSION.ATTACK ? targetId : null,
    targetRecoveryItemId: preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY ? targetId : null,
    recoveryCollectionProgressSec: null,
    nodeId: preview.origin.nodeId,
    path: normalizePath(preview.path), pathIndex: 0, edgeId: preview.path.edgeIds[0] ?? null, edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.OUTBOUND, order: FRIENDLY_SQUAD_ORDER.ADVANCE,
    commandDestinationNodeId: preview.path.targetId, travelHistoryNodeIds: [preview.origin.nodeId],
    engagedEnemyId: null, combatCooldown: 0, departDelay: 0,
    recoveryBaseId: null, recoveryStartedAt: null, reorganizationRemaining: 0,
    recoveryTargetHp: squad.hp, recoveryFacilityType: null, recoveryFacilityId: null, readyAt: null, deployedAt: worldTime
  });
  if (!preview.reuseReadySquad) state.combat.friendlySquads.push(squad);
  events?.emit('friendly:squad-deployed', { squad, origin: preview.origin, target: preview.target, cost: preview.cost, redeployed: preview.reuseReadySquad });
  const targetLabel = preview.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY ? `${recoveryItemPresentation(preview.target).name}の回収へ` : '';
  events?.emit('message', { text: preview.reuseReadySquad ? `${preview.origin.name}から${definition.name}が${targetLabel || '再'}出撃しました。` : `${preview.origin.name}から${definition.name}が${targetLabel || ''}出撃しました。` });
  return { ok: true, squad, cost: preview.cost, routeDistance: preview.routeDistance, redeployed: preview.reuseReadySquad, replaced: preview.replaceReadySquad };
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
  const nextNodeId = movingInsideEdge && squad.path?.nodeIds?.[squad.pathIndex + 1]
    ? squad.path.nodeIds[squad.pathIndex + 1]
    : squad.nodeId;
  if (!routeMatchesGraph(state, normalized, nextNodeId, expectedDestinationNodeId)) return false;
  if (movingInsideEdge) {
    const currentFrom = squad.path.nodeIds[squad.pathIndex];
    squad.path = {
      nodeIds: [currentFrom, ...normalized.nodeIds],
      edgeIds: [squad.edgeId, ...normalized.edgeIds],
      cost: Math.max(0, currentEdge.length - squad.edgeProgress) + normalized.cost,
      targetId: normalized.targetId
    };
    squad.pathIndex = 0;
    return true;
  }
  squad.path = normalized;
  squad.pathIndex = 0;
  squad.edgeId = normalized.edgeIds[0] ?? null;
  squad.edgeProgress = 0;
  squad.nodeId = normalized.nodeIds[0] ?? squad.nodeId;
  return true;
}

export function holdFriendlySquad(state, squadId, events = null) {
  const squad = friendlySquadById(state, squadId);
  if (!squad) return { ok: false, reason: '部隊が見つかりません。' };
  if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
    return { ok: false, reason: '拠点で回復・待機中の部隊には移動命令を出せません。' };
  }
  if (squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW || squad.order === FRIENDLY_SQUAD_ORDER.RETURN) {
    return { ok: false, reason: '帰還中の部隊は停止命令へ変更できません。' };
  }
  if (squad.order !== FRIENDLY_SQUAD_ORDER.HOLD) {
    squad.heldOrder = squad.order;
    squad.heldDestinationNodeId = squad.commandDestinationNodeId;
  }
  squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
  if (squad.status !== FRIENDLY_SQUAD_STATUS.ENGAGED) squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
  events?.emit('friendly:squad-order', { squadId, order: squad.order });
  events?.emit('message', { text: '味方部隊へ停止命令を出しました。' });
  return { ok: true, squad };
}

export function issueFriendlyRouteOrder(state, squadId, { order, path, destinationNodeId }, events = null) {
  const squad = friendlySquadById(state, squadId);
  if (!squad) return { ok: false, reason: '部隊が見つかりません。' };
  if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
    return { ok: false, reason: '拠点で回復・待機中の部隊には経路命令を出せません。' };
  }
  if (![FRIENDLY_SQUAD_ORDER.ADVANCE, FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(order)) {
    return { ok: false, reason: '無効な部隊命令です。' };
  }
  if ([FRIENDLY_SQUAD_ORDER.WITHDRAW, FRIENDLY_SQUAD_ORDER.RETURN].includes(squad.order)) {
    return { ok: false, reason: '撤退・帰還を開始した部隊の任務は変更できません。' };
  }
  let advanceTarget = null;
  if (order === FRIENDLY_SQUAD_ORDER.ADVANCE) {
    if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
      advanceTarget = ensureRecoveryState(state).find(item => item.id === squad.targetRecoveryItemId && item.assignedSquadId === squad.id && [RECOVERY_ITEM_STATUS.RESERVED, RECOVERY_ITEM_STATUS.CARRIED].includes(item.status)) ?? null;
      if (!advanceTarget) return { ok: false, reason: '回収目標が失われています。撤退してください。' };
    } else {
      const targetId = squad.missionTargetBaseId ?? squad.targetBaseId;
      advanceTarget = state.world.enemyBases.find(base => base.id === targetId && base.alive && base.hp > 0) ?? null;
      if (!advanceTarget) return { ok: false, reason: '元の攻撃目標は既に失われています。撤退してください。' };
    }
  }
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    const origin = ownedBaseById(state, squad.originBaseId) ?? activePlayerBases(state)[0] ?? null;
    if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: '帰還可能な拠点がありません。' };
  }
  if (!assignPathAtCurrentPosition(state, squad, path, destinationNodeId ?? path?.targetId ?? null)) return { ok: false, reason: '現在位置から選択ルートへ接続できません。' };
  if (advanceTarget && squad.missionType === FRIENDLY_SQUAD_MISSION.ATTACK) squad.targetBaseId = advanceTarget.id;
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    if (squad.targetRecoveryItemId) releaseRecoveryItem(state, squad.targetRecoveryItemId, squad.id, squad.status === FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM ? friendlySquadPosition(state, squad) : null);
    squad.targetRecoveryItemId = null;
    squad.recoveryCollectionProgressSec = null;
    squad.targetBaseId = null;
    squad.missionTargetBaseId = null;
  }
  squad.commandDestinationNodeId = destinationNodeId ?? path.targetId ?? null;
  if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY && order !== FRIENDLY_SQUAD_ORDER.HOLD) squad.recoveryCollectionProgressSec = null;
  squad.order = order;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.status = statusForOrder(order);
  squad.engagedEnemyId = null;
  events?.emit('friendly:squad-order', { squadId, order, destinationNodeId: squad.commandDestinationNodeId });
  const label = order === FRIENDLY_SQUAD_ORDER.RETREAT ? '後退' : order === FRIENDLY_SQUAD_ORDER.WITHDRAW ? '撤退' : '進軍再開';
  events?.emit('message', { text: `味方部隊へ${label}命令を出しました。` });
  return { ok: true, squad };
}

function planReturn(state, squad) {
  const origin = ownedBaseById(state, squad.originBaseId) ?? activePlayerBases(state)[0] ?? null;
  if (!origin) return false;
  const currentEdge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  const routeStart = currentEdge && squad.edgeProgress > 0 && squad.edgeProgress < currentEdge.length && squad.path?.nodeIds?.[squad.pathIndex + 1]
    ? squad.path.nodeIds[squad.pathIndex + 1]
    : squad.nodeId;
  const path = findRoadPath(state, routeStart, origin.nodeId);
  if (squad.missionType === FRIENDLY_SQUAD_MISSION.ATTACK) {
    squad.targetBaseId = null;
    squad.missionTargetBaseId = null;
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
    .map(base => ({ base, path: findRoadPath(state, squad.nodeId, base.nodeId) }))
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
  squad.commandDestinationNodeId = fallback.base.nodeId;
  squad.order = FRIENDLY_SQUAD_ORDER.RETURN;
  squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.recoveryStartedAt = null;
  squad.reorganizationRemaining = 0;
  squad.recoveryTargetHp = squad.hp;
  squad.recoveryFacilityType = null;
  squad.recoveryFacilityId = null;
  squad.readyAt = null;
  events?.emit('friendly:squad-recovery-relocated', { squadId: squad.id, baseId: fallback.base.id });
  events?.emit('message', { text: `療養中の拠点が失われたため、部隊は${fallback.base.name}へ退避します。` });
  return true;
}

function currentTargetBase(state, squad) {
  return squad.targetBaseId
    ? state.world.enemyBases.find(base => base.id === squad.targetBaseId && base.alive && base.hp > 0) ?? null
    : null;
}

function currentRecoveryItem(state, squad) {
  return squad.targetRecoveryItemId
    ? ensureRecoveryState(state).find(item => item.id === squad.targetRecoveryItemId && item.assignedSquadId === squad.id) ?? null
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
  events?.emit('message', { text: `${recoveryItemPresentation(item).name}を確保しました。拠点へ帰還します。` });
  planReturn(state, squad);
}

function acquireEnemy(state, squad, spatial, definition) {
  const position = friendlySquadPosition(state, squad);
  const priority = new Map((definition.targetPriorityTypes ?? []).map((type, index) => [type, index]));
  const candidates = spatial.query(position, definition.engagementRange)
    .filter(entry => entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((a, b) => {
      const rankA = priority.has(a.enemy.type) ? priority.get(a.enemy.type) : Number.MAX_SAFE_INTEGER;
      const rankB = priority.has(b.enemy.type) ? priority.get(b.enemy.type) : Number.MAX_SAFE_INTEGER;
      return rankA - rankB || distance(a.position, position) - distance(b.position, position);
    });
  const target = candidates[0]?.enemy ?? null;
  squad.engagedEnemyId = target?.id ?? null;
  if (target) target.engagedSquadId = squad.id;
  return target;
}

function updateEngagement(state, squad, definition, deltaSeconds, spatial, events) {
  let enemy = squad.engagedEnemyId ? state.combat.enemies.find(item => item.id === squad.engagedEnemyId && item.hp > 0) : null;
  const squadPoint = friendlySquadPosition(state, squad);
  if (enemy && distance(enemyPosition(state, enemy), squadPoint) > definition.engagementRange + 5) {
    if (enemy.engagedSquadId === squad.id) enemy.engagedSquadId = null;
    squad.engagedEnemyId = null;
    enemy = null;
  }
  enemy ??= acquireEnemy(state, squad, spatial, definition);
  if (!enemy) return false;
  squad.status = FRIENDLY_SQUAD_STATUS.ENGAGED;
  squad.combatCooldown = Math.max(squad.combatCooldown ?? 0, definition.recoveryDelaySeconds ?? 0);
  damageEnemy(state, enemy, friendlySquadEnemyDamage(definition, enemy.type) * deltaSeconds, events, spatial);
  if (enemy.hp <= 0) squad.engagedEnemyId = null;
  return true;
}


function exposeEvasiveSquad(state, squad, definition, spatial) {
  const position = friendlySquadPosition(state, squad);
  const candidate = spatial.query(position, definition.engagementRange)
    .filter(entry => entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((a, b) => distance(a.position, position) - distance(b.position, position))[0]?.enemy ?? null;
  if (candidate && (!candidate.engagedSquadId || candidate.engagedSquadId === squad.id)) candidate.engagedSquadId = squad.id;
}


function updateNonCombatRecovery(squad, definition, deltaSeconds) {
  squad.combatCooldown = Math.max(0, (squad.combatCooldown ?? 0) - deltaSeconds);
  if (!(definition.nonCombatRecoveryPerSecond > 0)) return;
  if (squad.combatCooldown > 0 || squad.status === FRIENDLY_SQUAD_STATUS.ENGAGED || squad.status === FRIENDLY_SQUAD_STATUS.ATTACKING_BASE) return;
  squad.hp = Math.min(squad.maxHp, squad.hp + definition.nonCombatRecoveryPerSecond * deltaSeconds);
}

function advanceAlongPath(state, squad, definition, deltaSeconds) {
  if (!squad.path || !squad.edgeId) return 'ARRIVED';
  const edge = state.world.roadGraph.edgeById.get(squad.edgeId);
  if (!edge) return 'BROKEN';
  squad.edgeProgress += definition.speed * deltaSeconds;
  if (squad.edgeProgress < edge.length) return 'MOVING';
  squad.nodeId = squad.path.nodeIds[squad.pathIndex + 1];
  appendHistory(squad, squad.nodeId);
  squad.pathIndex += 1;
  squad.edgeProgress = 0;
  if (squad.pathIndex >= squad.path.edgeIds.length) {
    squad.edgeId = null;
    return 'ARRIVED';
  }
  squad.edgeId = squad.path.edgeIds[squad.pathIndex];
  return 'MOVING';
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
  target.hp = Math.max(0, target.hp - definition.baseDps * deltaSeconds);
  if (target.hp > 0) return;
  destroyEnemyBase(state, target, events, { squadId: squad.id });
  planReturn(state, squad);
}

function replanStranded(state, squad) {
  let targetNodeId = null;
  if (squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE) targetNodeId = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
    ? currentRecoveryItem(state, squad)?.nodeId ?? null
    : currentTargetBase(state, squad)?.nodeId ?? null;
  if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) targetNodeId = ownedBaseById(state, squad.originBaseId)?.nodeId ?? activePlayerBases(state)[0]?.nodeId ?? null;
  if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) targetNodeId = squad.commandDestinationNodeId;
  if (!targetNodeId) return false;
  const path = findRoadPath(state, squad.nodeId, targetNodeId);
  if (!path) return false;
  squad.path = normalizePath(path);
  squad.pathIndex = 0;
  squad.edgeId = path.edgeIds[0] ?? null;
  squad.edgeProgress = 0;
  squad.status = statusForOrder(squad.order);
  return true;
}

export class FriendlyForceSystem {
  constructor(events = null) {
    this.events = events;
  }

  previewDeployment(state, originBaseId, targetBaseId, squadType = 'assault') {
    return previewFriendlyDeployment(state, squadType, originBaseId, targetBaseId);
  }

  dispatch(state, originBaseId, targetBaseId, squadType = 'assault') {
    return dispatchFriendlySquad(state, squadType, originBaseId, targetBaseId, this.events);
  }

  hold(state, squadId) {
    return holdFriendlySquad(state, squadId, this.events);
  }

  issueRouteOrder(state, squadId, order) {
    return issueFriendlyRouteOrder(state, squadId, order, this.events);
  }

  update(state, deltaSeconds, spatial, shouldUpdate = null) {
    ensureFriendlyForceState(state);
    const remove = new Set();
    for (const squad of state.combat.friendlySquads) {
      if (squad.hp <= 0) {
        const dropped = releaseSquadRecoveryItem(state, squad, true);
        if (dropped) {
          this.events?.emit('friendly:recovery-item-dropped', { squadId: squad.id, itemId: dropped.id, position: recoveryItemPoint(state, dropped) });
          this.events?.emit('message', { text: '回収部隊が全滅し、特殊アイテムが道路上へ残されました。' });
        }
        remove.add(squad.id);
        continue;
      }
      if (shouldUpdate && !shouldUpdate(squad)) continue;
      const definition = friendlySquadDefinition(squad.type);
      synchronizeCarriedItem(state, squad);
      if (squad.status === FRIENDLY_SQUAD_STATUS.READY) continue;
      if (squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING) {
        const recovery = updateFriendlyRecovery(state, squad, deltaSeconds, this.events);
        if (recovery.stranded) redirectRecoverySquadToMajorBase(state, squad, this.events);
        continue;
      }
      if (squad.departDelay > 0) {
        squad.departDelay = Math.max(0, squad.departDelay - deltaSeconds);
        continue;
      }

      const evasive = [FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order);
      if (evasive) exposeEvasiveSquad(state, squad, definition, spatial);
      if (!evasive && updateEngagement(state, squad, definition, deltaSeconds, spatial, this.events)) continue;
      if (squad.status === FRIENDLY_SQUAD_STATUS.ENGAGED) squad.status = statusForOrder(squad.order);
      updateNonCombatRecovery(squad, definition, deltaSeconds);

      if (squad.order === FRIENDLY_SQUAD_ORDER.HOLD) {
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
          if (squad.targetRecoveryItemId && !currentRecoveryItem(state, squad)) planReturn(state, squad);
        } else {
          const missionId = squad.missionTargetBaseId ?? squad.targetBaseId;
          if (missionId && !state.world.enemyBases.some(base => base.id === missionId && base.alive && base.hp > 0)) planReturn(state, squad);
        }
        continue;
      }

      if (squad.recoveryCollectionProgressSec != null || squad.status === FRIENDLY_SQUAD_STATUS.COLLECTING_ITEM) {
        updateRecoveryCollection(state, squad, definition, deltaSeconds, this.events);
        continue;
      }

      if (squad.status === FRIENDLY_SQUAD_STATUS.ATTACKING_BASE) {
        attackEnemyBase(state, squad, definition, deltaSeconds, this.events);
        continue;
      }
      if (squad.status === FRIENDLY_SQUAD_STATUS.STRANDED) {
        replanStranded(state, squad);
        continue;
      }

      const movement = advanceAlongPath(state, squad, definition, deltaSeconds);
      if (movement === 'BROKEN') {
        squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
        squad.path = null;
        squad.edgeId = null;
        continue;
      }
      if (movement !== 'ARRIVED') continue;

      if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) {
        clearEnemyEngagements(state, squad.id);
        const recoveryBaseId = squad.recoveryBaseId ?? squad.originBaseId;
        if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY && squad.targetRecoveryItemId) {
          const item = currentRecoveryItem(state, squad);
          if (item?.status === RECOVERY_ITEM_STATUS.CARRIED) {
            const delivered = deliverRecoveryItem(state, item.id, squad.id);
            if (delivered.ok) {
              this.events?.emit('exploration:recovery-collected', delivered);
              this.events?.emit('message', { text: `${recoveryItemPresentation(item).name}を拠点へ持ち帰りました。` });
            }
          } else releaseSquadRecoveryItem(state, squad);
          squad.targetRecoveryItemId = null;
          squad.recoveryCollectionProgressSec = null;
        }
        const recovery = beginFriendlyRecovery(state, squad, recoveryBaseId);
        if (!recovery.ok) {
          squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
          squad.path = null;
          squad.edgeId = null;
          continue;
        }
        this.events?.emit('friendly:squad-returned', { squadId: squad.id, originBaseId: recoveryBaseId, hp: squad.hp, withdrawal: squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW });
        this.events?.emit('message', { text: '部隊が拠点へ帰還し、回復・再編成を開始しました。' });
      } else if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) {
        squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
        squad.heldOrder = FRIENDLY_SQUAD_ORDER.ADVANCE;
        squad.heldDestinationNodeId = squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY
          ? currentRecoveryItem(state, squad)?.nodeId ?? null
          : state.world.enemyBases.find(base => base.id === (squad.missionTargetBaseId ?? squad.targetBaseId) && base.alive && base.hp > 0)?.nodeId ?? null;
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        this.events?.emit('message', { text: '味方部隊が指定地点まで後退し、停止しました。' });
      } else if (squad.missionType === FRIENDLY_SQUAD_MISSION.RECOVERY) {
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        squad.recoveryCollectionProgressSec = 0;
        updateRecoveryCollection(state, squad, definition, 0, this.events);
      } else {
        attackEnemyBase(state, squad, definition, deltaSeconds, this.events);
      }
    }
    if (remove.size) state.combat.friendlySquads = state.combat.friendlySquads.filter(squad => !remove.has(squad.id));
  }
}
