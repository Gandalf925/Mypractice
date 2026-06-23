import { consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { activePlayerBases, ensurePlayerBaseState, playerBaseById } from '../base/player-bases.js';
import { distance, stableId } from '../core/utilities.js';
import { findRoadPath } from './routing-system.js';
import { damageEnemy, enemyPosition } from './enemy-system.js';
import { destroyEnemyBase } from './enemy-base-system.js';
import { roadUnitPosition } from './road-unit-position.js';

export const FRIENDLY_SQUAD_DEFINITIONS = Object.freeze({
  assault: Object.freeze({
    type: 'assault',
    name: '突撃部隊',
    members: 6,
    hp: 180,
    speed: 1.25,
    enemyDps: 9,
    baseDps: 7,
    engagementRange: 18,
    cost: Object.freeze({ wood: 44, stone: 18, fiber: 32 })
  })
});

export const FRIENDLY_SQUAD_STATUS = Object.freeze({
  OUTBOUND: 'OUTBOUND',
  ENGAGED: 'ENGAGED',
  ATTACKING_BASE: 'ATTACKING_BASE',
  HALTED: 'HALTED',
  RETREATING: 'RETREATING',
  WITHDRAWING: 'WITHDRAWING',
  RETURNING: 'RETURNING',
  STRANDED: 'STRANDED'
});

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
  state.combat.friendlySquads = Array.isArray(state.combat.friendlySquads) ? state.combat.friendlySquads : [];
  for (const squad of state.combat.friendlySquads) {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[squad.type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    squad.type = definition.type;
    squad.maxHp = Math.max(1, Number(squad.maxHp) || definition.hp);
    squad.hp = Math.max(0, Math.min(squad.maxHp, Number(squad.hp ?? squad.maxHp) || 0));
    squad.status = VALID_STATUS.has(squad.status) ? squad.status : FRIENDLY_SQUAD_STATUS.OUTBOUND;
    squad.order = VALID_ORDER.has(squad.order)
      ? squad.order
      : squad.status === FRIENDLY_SQUAD_STATUS.RETURNING
        ? FRIENDLY_SQUAD_ORDER.RETURN
        : FRIENDLY_SQUAD_ORDER.ADVANCE;
    squad.missionTargetBaseId ??= squad.targetBaseId ?? null;
    squad.commandDestinationNodeId ??= squad.path?.targetId ?? null;
    squad.heldOrder = VALID_ORDER.has(squad.heldOrder) ? squad.heldOrder : null;
    squad.heldDestinationNodeId ??= null;
    squad.pathIndex = Math.max(0, Number(squad.pathIndex) || 0);
    squad.edgeProgress = Math.max(0, Number(squad.edgeProgress) || 0);
    squad.attackClock = Math.max(0, Number(squad.attackClock) || 0);
    squad.departDelay = Math.max(0, Number(squad.departDelay) || 0);
    squad.engagedEnemyId ??= null;
    squad.path = normalizePath(squad.path);
    squad.travelHistoryNodeIds = Array.isArray(squad.travelHistoryNodeIds) && squad.travelHistoryNodeIds.length
      ? [...squad.travelHistoryNodeIds]
      : [squad.nodeId].filter(Boolean);
  }
  return state.combat.friendlySquads;
}

export function friendlySquadPosition(state, squad) {
  return roadUnitPosition(state, squad);
}

export function friendlySquadById(state, squadId) {
  return ensureFriendlyForceState(state).find(squad => squad.id === squadId && squad.hp > 0) ?? null;
}

function activeSquadsFromBase(state, baseId) {
  return ensureFriendlyForceState(state).filter(squad => squad.originBaseId === baseId && squad.hp > 0).length;
}

export function previewAssaultDeployment(state, originBaseId, targetBaseId) {
  ensureFriendlyForceState(state);
  const origin = playerBaseById(state, originBaseId);
  if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: '出撃可能な拠点ではありません。' };
  const target = state.world.enemyBases.find(base => base.id === targetBaseId && base.alive && base.hp > 0);
  if (!target) return { ok: false, reason: '攻撃可能な敵拠点ではありません。' };
  if (activeSquadsFromBase(state, origin.id) >= MAX_ACTIVE_SQUADS_PER_BASE) return { ok: false, reason: 'この拠点は既に部隊を派遣しています。' };
  const path = findRoadPath(state, origin.nodeId, target.nodeId);
  if (!path) return { ok: false, reason: '敵拠点へ到達できる道路経路がありません。' };
  const definition = FRIENDLY_SQUAD_DEFINITIONS.assault;
  const missing = missingBundle(state, definition.cost);
  return {
    ok: Object.keys(missing).length === 0,
    reason: Object.keys(missing).length ? '派兵に必要な資源が不足しています。' : null,
    origin,
    target,
    path,
    routeDistance: path.cost,
    cost: { ...definition.cost },
    missing
  };
}

export function dispatchAssaultSquad(state, originBaseId, targetBaseId, events = null) {
  const preview = previewAssaultDeployment(state, originBaseId, targetBaseId);
  if (!preview.ok) return preview;
  if (!consumeBundle(state, preview.cost)) return { ok: false, reason: '派兵確定時に資源が不足しました。' };
  const definition = FRIENDLY_SQUAD_DEFINITIONS.assault;
  const worldTime = state.runtime?.worldTimeMs ?? Date.now();
  const squad = {
    id: stableId('friendly_squad', originBaseId, targetBaseId, worldTime, state.combat.friendlySquads.length),
    type: definition.type,
    hp: definition.hp,
    maxHp: definition.hp,
    members: definition.members,
    originBaseId,
    targetBaseId,
    missionTargetBaseId: targetBaseId,
    nodeId: preview.origin.nodeId,
    path: normalizePath(preview.path),
    pathIndex: 0,
    edgeId: preview.path.edgeIds[0] ?? null,
    edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.OUTBOUND,
    order: FRIENDLY_SQUAD_ORDER.ADVANCE,
    commandDestinationNodeId: preview.target.nodeId,
    travelHistoryNodeIds: [preview.origin.nodeId],
    engagedEnemyId: null,
    attackClock: 0,
    departDelay: 0,
    deployedAt: worldTime
  };
  state.combat.friendlySquads.push(squad);
  events?.emit('friendly:squad-deployed', { squad, origin: preview.origin, target: preview.target, cost: preview.cost });
  events?.emit('message', { text: `${preview.origin.name}から${definition.name}が出撃しました。` });
  return { ok: true, squad, cost: preview.cost, routeDistance: preview.routeDistance };
}

function clearEnemyEngagements(state, squadId) {
  for (const enemy of state.combat.enemies) {
    if (enemy.engagedSquadId === squadId) enemy.engagedSquadId = null;
  }
}

export function damageFriendlySquad(state, squad, amount, events = null) {
  if (!squad || squad.hp <= 0) return false;
  squad.hp = Math.max(0, squad.hp - Math.max(0, Number(amount) || 0));
  if (squad.hp > 0) return false;
  clearEnemyEngagements(state, squad.id);
  events?.emit('friendly:squad-destroyed', { squadId: squad.id, position: friendlySquadPosition(state, squad), originBaseId: squad.originBaseId });
  events?.emit('message', { text: '派遣した攻撃部隊が全滅しました。' });
  return true;
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
  if (![FRIENDLY_SQUAD_ORDER.ADVANCE, FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(order)) {
    return { ok: false, reason: '無効な部隊命令です。' };
  }
  if ([FRIENDLY_SQUAD_ORDER.WITHDRAW, FRIENDLY_SQUAD_ORDER.RETURN].includes(squad.order)) {
    return { ok: false, reason: '撤退・帰還を開始した部隊の任務は変更できません。' };
  }
  let advanceTarget = null;
  if (order === FRIENDLY_SQUAD_ORDER.ADVANCE) {
    const targetId = squad.missionTargetBaseId ?? squad.targetBaseId;
    advanceTarget = state.world.enemyBases.find(base => base.id === targetId && base.alive && base.hp > 0) ?? null;
    if (!advanceTarget) return { ok: false, reason: '元の攻撃目標は既に失われています。撤退してください。' };
  }
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    const origin = playerBaseById(state, squad.originBaseId);
    if (!origin || origin.status !== 'ESTABLISHED' || origin.hp <= 0) return { ok: false, reason: '帰還可能な出撃元拠点がありません。' };
  }
  if (!assignPathAtCurrentPosition(state, squad, path, destinationNodeId ?? path?.targetId ?? null)) return { ok: false, reason: '現在位置から選択ルートへ接続できません。' };
  if (advanceTarget) squad.targetBaseId = advanceTarget.id;
  if (order === FRIENDLY_SQUAD_ORDER.WITHDRAW) {
    squad.targetBaseId = null;
    squad.missionTargetBaseId = null;
  }
  squad.commandDestinationNodeId = destinationNodeId ?? path.targetId ?? null;
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
  const origin = playerBaseById(state, squad.originBaseId) ?? activePlayerBases(state)[0] ?? null;
  if (!origin) return false;
  const currentEdge = squad.edgeId ? state.world.roadGraph.edgeById.get(squad.edgeId) : null;
  const routeStart = currentEdge && squad.edgeProgress > 0 && squad.edgeProgress < currentEdge.length && squad.path?.nodeIds?.[squad.pathIndex + 1]
    ? squad.path.nodeIds[squad.pathIndex + 1]
    : squad.nodeId;
  const path = findRoadPath(state, routeStart, origin.nodeId);
  squad.targetBaseId = null;
  squad.missionTargetBaseId = null;
  squad.engagedEnemyId = null;
  squad.order = FRIENDLY_SQUAD_ORDER.RETURN;
  squad.heldOrder = null;
  squad.heldDestinationNodeId = null;
  squad.commandDestinationNodeId = origin.nodeId;
  if (!path || !assignPathAtCurrentPosition(state, squad, path, origin.nodeId)) {
    squad.status = FRIENDLY_SQUAD_STATUS.STRANDED;
    squad.path = null;
    squad.edgeId = null;
    return false;
  }
  squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  return true;
}

function currentTargetBase(state, squad) {
  return squad.targetBaseId
    ? state.world.enemyBases.find(base => base.id === squad.targetBaseId && base.alive && base.hp > 0) ?? null
    : null;
}

function acquireEnemy(state, squad, spatial, definition) {
  const position = friendlySquadPosition(state, squad);
  const candidates = spatial.query(position, definition.engagementRange)
    .filter(entry => entry.enemy.hp > 0 && entry.enemy.departDelay <= 0)
    .sort((a, b) => distance(a.position, position) - distance(b.position, position));
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
  damageEnemy(state, enemy, definition.enemyDps * deltaSeconds, events, spatial);
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
  target.hp = Math.max(0, target.hp - definition.baseDps * deltaSeconds);
  if (target.hp > 0) return;
  destroyEnemyBase(state, target, events, { squadId: squad.id });
  planReturn(state, squad);
}

function replanStranded(state, squad) {
  let targetNodeId = null;
  if (squad.order === FRIENDLY_SQUAD_ORDER.ADVANCE) targetNodeId = currentTargetBase(state, squad)?.nodeId ?? null;
  if ([FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) targetNodeId = playerBaseById(state, squad.originBaseId)?.nodeId ?? null;
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

  previewDeployment(state, originBaseId, targetBaseId) {
    return previewAssaultDeployment(state, originBaseId, targetBaseId);
  }

  dispatch(state, originBaseId, targetBaseId) {
    return dispatchAssaultSquad(state, originBaseId, targetBaseId, this.events);
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
      if (squad.hp <= 0) { remove.add(squad.id); continue; }
      if (shouldUpdate && !shouldUpdate(squad)) continue;
      const definition = FRIENDLY_SQUAD_DEFINITIONS[squad.type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
      if (squad.departDelay > 0) {
        squad.departDelay = Math.max(0, squad.departDelay - deltaSeconds);
        continue;
      }

      const evasive = [FRIENDLY_SQUAD_ORDER.RETREAT, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order);
      if (evasive) exposeEvasiveSquad(state, squad, definition, spatial);
      if (!evasive && updateEngagement(state, squad, definition, deltaSeconds, spatial, this.events)) continue;
      if (squad.status === FRIENDLY_SQUAD_STATUS.ENGAGED) squad.status = statusForOrder(squad.order);

      if (squad.order === FRIENDLY_SQUAD_ORDER.HOLD) {
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        const missionId = squad.missionTargetBaseId ?? squad.targetBaseId;
        if (missionId && !state.world.enemyBases.some(base => base.id === missionId && base.alive && base.hp > 0)) planReturn(state, squad);
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
        remove.add(squad.id);
        this.events?.emit('friendly:squad-returned', { squadId: squad.id, originBaseId: squad.originBaseId, hp: squad.hp, withdrawal: squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW });
        this.events?.emit('message', { text: squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW ? '撤退部隊が出撃元へ帰還しました。' : '攻撃部隊が出撃元の拠点へ帰還しました。' });
      } else if (squad.order === FRIENDLY_SQUAD_ORDER.RETREAT) {
        squad.order = FRIENDLY_SQUAD_ORDER.HOLD;
        squad.heldOrder = FRIENDLY_SQUAD_ORDER.ADVANCE;
        squad.heldDestinationNodeId = state.world.enemyBases.find(base => base.id === (squad.missionTargetBaseId ?? squad.targetBaseId) && base.alive && base.hp > 0)?.nodeId ?? null;
        squad.status = FRIENDLY_SQUAD_STATUS.HALTED;
        squad.path = null;
        squad.edgeId = null;
        squad.edgeProgress = 0;
        this.events?.emit('message', { text: '味方部隊が指定地点まで後退し、停止しました。' });
      } else {
        attackEnemyBase(state, squad, definition, deltaSeconds, this.events);
      }
    }
    if (remove.size) state.combat.friendlySquads = state.combat.friendlySquads.filter(squad => !remove.has(squad.id));
  }
}
