import { distance, stableId } from '../core/utilities.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';
import { activePlayerBases } from './player-bases.js';
import {
  FIELD_BASE_ENEMY_EXCLUSION_METERS,
  FIELD_BASE_MAX_HP,
  FIELD_BASE_MINIMUM_SEPARATION_METERS,
  FIELD_BASE_BUILD_RANGE_METERS,
  activeFieldBases,
  ensureFieldBaseState,
  fieldBaseById,
  fieldBaseLimitForCivilization,
  fieldBaseSlotsUsed,
  nearestOwnedBase
} from './field-bases.js';
import {
  PLAYER_BASE_LOCATION_MAX_AGE_MS,
  PLAYER_BASE_MAX_ACCURACY_METERS
} from './player-base-system.js';

function validateLocation(state, now) {
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: '現在地を取得してください。' };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > PLAYER_BASE_LOCATION_MAX_AGE_MS) {
    return { ok: false, reason: '位置情報が古いため簡易拠点を設置できません。現在地を再取得してください。' };
  }
  const accuracy = Number(state.player?.locationAccuracy);
  if (Number.isFinite(accuracy) && accuracy > PLAYER_BASE_MAX_ACCURACY_METERS) {
    return { ok: false, reason: '位置情報の精度が不足しています。' };
  }
  return { ok: true, player };
}

function nearestRoadNode(state, point) {
  const graph = state.world.roadGraph;
  if (!graph?.nodeById || !point) return null;
  let nearest = null;
  for (const node of graphElementsNearPoint(graph, point, FIELD_BASE_BUILD_RANGE_METERS).nodes) {
    const gap = distance(point, node);
    if (gap > FIELD_BASE_BUILD_RANGE_METERS) continue;
    if (!nearest || gap < nearest.distance) nearest = { node, distance: gap };
  }
  return nearest;
}

function nearestAliveEnemyBase(state, point) {
  return (state.world.enemyBases ?? [])
    .filter(base => base.alive && base.hp > 0)
    .map(base => {
      const node = state.world.roadGraph?.nodeById?.get(base.nodeId) ?? base;
      return { base, gap: distance(point, node) };
    })
    .sort((a, b) => a.gap - b.gap)[0] ?? null;
}

export function previewFieldBasePlacement(state, now = Date.now()) {
  ensureFieldBaseState(state);
  const limit = fieldBaseLimitForCivilization(state.civilization?.level);
  const used = fieldBaseSlotsUsed(state);
  if (limit <= 0) return { ok: false, reason: '文明Lv.1で簡易拠点が解禁されます。', current: used, limit };
  if (used >= limit) return { ok: false, reason: `現在の文明レベルでは簡易拠点を${limit}個まで設置できます。`, current: used, limit };

  const location = validateLocation(state, now);
  if (!location.ok) return { ...location, current: used, limit };
  const road = nearestRoadNode(state, location.player);
  if (!road) {
    return { ok: false, reason: `取得済み道路の交差点から${FIELD_BASE_BUILD_RANGE_METERS}m以内へ移動してください。`, current: used, limit };
  }

  const nearest = nearestOwnedBase(state, road.node, { includeDestroyed: true });
  if (nearest && nearest.gap < FIELD_BASE_MINIMUM_SEPARATION_METERS) {
    return { ok: false, reason: `既存拠点から${FIELD_BASE_MINIMUM_SEPARATION_METERS}m以上離れてください。`, current: used, limit, nearest };
  }

  const hostile = nearestAliveEnemyBase(state, road.node);
  if (hostile && hostile.gap < FIELD_BASE_ENEMY_EXCLUSION_METERS) {
    return { ok: false, reason: `敵拠点から${FIELD_BASE_ENEMY_EXCLUSION_METERS}m以上離れてください。`, current: used, limit, hostile };
  }

  return {
    ok: true,
    current: used,
    limit,
    node: road.node,
    distanceToRoad: road.distance,
    nearestBaseDistance: nearest?.gap ?? null,
    nearestEnemyBaseDistance: hostile?.gap ?? null
  };
}

export function previewFieldBaseRebuild(state, baseId, now = Date.now()) {
  ensureFieldBaseState(state);
  const base = fieldBaseById(state, baseId, { includeDestroyed: true });
  if (!base) return { ok: false, reason: '簡易拠点が見つかりません。' };
  if (base.status !== 'DESTROYED' && base.hp > 0) return { ok: false, reason: 'この簡易拠点は稼働中です。' };
  const location = validateLocation(state, now);
  if (!location.ok) return location;
  const gap = distance(location.player, base);
  if (gap > FIELD_BASE_BUILD_RANGE_METERS) {
    return { ok: false, reason: `破壊された簡易拠点から${FIELD_BASE_BUILD_RANGE_METERS}m以内へ移動してください。`, distance: gap, base };
  }
  const node = state.world.roadGraph?.nodeById?.get(base.nodeId);
  if (!node) return { ok: false, reason: '簡易拠点が接続していた道路を利用できません。', base };
  return { ok: true, base, node, distance: gap };
}

export function destroyFieldBase(state, base, events = null, { enemyId = null } = {}) {
  if (!base || base.status === 'DESTROYED') return false;
  base.hp = 0;
  base.status = 'DESTROYED';
  base.destroyedAt = state.runtime?.worldTimeMs ?? Date.now();
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.targetFieldBaseId === base.id) {
      enemy.targetFieldBaseId = null;
      enemy.reroutePending = true;
    }
  }
  events?.emit('base:field-destroyed', { baseId: base.id, enemyId, position: { x: base.x, y: base.y } });
  events?.emit('message', { text: `${base.name}が破壊されました。現地で再建できます。` });
  return true;
}

export class FieldBaseSystem {
  constructor(events = null) {
    this.events = events;
  }

  previewCurrentLocation(state, now = Date.now()) {
    return previewFieldBasePlacement(state, now);
  }

  establishAtCurrentLocation(state, now = Date.now()) {
    const preview = this.previewCurrentLocation(state, now);
    if (!preview.ok) return preview;
    const establishedAt = state.runtime?.worldTimeMs ?? now;
    const sequence = ensureFieldBaseState(state).length + 1;
    const base = {
      id: stableId('field_base', preview.node.id, establishedAt, sequence),
      kind: 'FIELD',
      name: `簡易拠点 ${sequence}`,
      status: 'ESTABLISHED',
      nodeId: preview.node.id,
      x: preview.node.x,
      y: preview.node.y,
      hp: FIELD_BASE_MAX_HP,
      maxHp: FIELD_BASE_MAX_HP,
      establishedAt,
      destroyedAt: null
    };
    state.world.fieldBases.push(base);
    this.events?.emit('base:field-established', { base });
    this.events?.emit('message', { text: `${base.name}を設置しました。` });
    return { ok: true, base, current: activeFieldBases(state).length, limit: fieldBaseLimitForCivilization(state.civilization?.level) };
  }

  previewRebuild(state, baseId, now = Date.now()) {
    return previewFieldBaseRebuild(state, baseId, now);
  }

  rebuild(state, baseId, now = Date.now()) {
    const preview = this.previewRebuild(state, baseId, now);
    if (!preview.ok) return preview;
    const base = preview.base;
    base.status = 'ESTABLISHED';
    base.hp = base.maxHp = FIELD_BASE_MAX_HP;
    base.destroyedAt = null;
    base.rebuiltAt = state.runtime?.worldTimeMs ?? now;
    this.events?.emit('base:field-rebuilt', { base });
    this.events?.emit('message', { text: `${base.name}を再建しました。` });
    return { ok: true, base };
  }
}
