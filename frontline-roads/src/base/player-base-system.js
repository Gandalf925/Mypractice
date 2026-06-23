import { distance, stableId } from '../core/utilities.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';
import {
  PLAYER_BASE_MINIMUM_SEPARATION_METERS,
  PLAYER_BASE_PLACEMENT_RANGE_METERS,
  activePlayerBases,
  baseLimitForCivilization,
  canPlaceAdditionalBase,
  ensurePlayerBaseState
} from './player-bases.js';

export const PLAYER_BASE_LOCATION_MAX_AGE_MS = 60_000;
export const PLAYER_BASE_MAX_ACCURACY_METERS = 100;

function nearestRoadNode(state, point) {
  const graph = state.world.roadGraph;
  if (!graph?.nodeById || !point) return null;
  let nearest = null;
  for (const node of graphElementsNearPoint(graph, point, PLAYER_BASE_PLACEMENT_RANGE_METERS).nodes) {
    const gap = distance(point, node);
    if (gap > PLAYER_BASE_PLACEMENT_RANGE_METERS) continue;
    if (!nearest || gap < nearest.distance) nearest = { node, distance: gap };
  }
  return nearest;
}

export function previewPlayerBasePlacement(state, now = Date.now()) {
  const bases = activePlayerBases(state);
  const limit = baseLimitForCivilization(state.civilization?.level);
  if (bases.length >= limit) {
    return { ok: false, reason: `現在の文明レベルでは拠点を${limit}個まで設置できます。`, current: bases.length, limit };
  }
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: '現在地を取得してください。', current: bases.length, limit };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > PLAYER_BASE_LOCATION_MAX_AGE_MS) {
    return { ok: false, reason: '位置情報が古いため拠点を設置できません。現在地を再取得してください。', current: bases.length, limit };
  }
  const accuracy = Number(state.player?.locationAccuracy);
  if (Number.isFinite(accuracy) && accuracy > PLAYER_BASE_MAX_ACCURACY_METERS) {
    return { ok: false, reason: '位置情報の精度が不足しています。', current: bases.length, limit };
  }
  const road = nearestRoadNode(state, player);
  if (!road) {
    return { ok: false, reason: `取得済み道路の交差点から${PLAYER_BASE_PLACEMENT_RANGE_METERS}m以内へ移動してください。`, current: bases.length, limit };
  }
  const separation = canPlaceAdditionalBase(state, road.node);
  if (!separation.ok) return { ...separation, current: bases.length, limit };
  const nearestFieldBase = (state.world.fieldBases ?? [])
    .map(base => ({ base, gap: distance(base, road.node) }))
    .sort((left, right) => left.gap - right.gap)[0] ?? null;
  if (nearestFieldBase && nearestFieldBase.gap < PLAYER_BASE_MINIMUM_SEPARATION_METERS) {
    return { ok: false, reason: `簡易拠点から${PLAYER_BASE_MINIMUM_SEPARATION_METERS}m以上離れてください。`, nearest: nearestFieldBase, current: bases.length, limit };
  }
  return {
    ok: true,
    current: bases.length,
    limit,
    node: road.node,
    distanceToRoad: road.distance,
    nearestBaseDistance: separation.nearest?.gap ?? null
  };
}

export class PlayerBaseSystem {
  constructor(events = null) {
    this.events = events;
  }

  previewCurrentLocation(state, now = Date.now()) {
    ensurePlayerBaseState(state);
    return previewPlayerBasePlacement(state, now);
  }

  establishAtCurrentLocation(state, now = Date.now()) {
    const preview = this.previewCurrentLocation(state, now);
    if (!preview.ok) return preview;
    const establishedAt = state.runtime?.worldTimeMs ?? now;
    const sequence = activePlayerBases(state).length + 1;
    const base = {
      id: stableId('player_base', preview.node.id, establishedAt, sequence),
      name: `主要拠点 ${sequence}`,
      status: 'ESTABLISHED',
      primary: false,
      nodeId: preview.node.id,
      x: preview.node.x,
      y: preview.node.y,
      hp: 100,
      maxHp: 100,
      establishedAt
    };
    state.world.playerBases.push(base);
    ensurePlayerBaseState(state);
    this.events?.emit('base:player-established', { base });
    this.events?.emit('message', { text: `${base.name}を設置しました。` });
    return { ok: true, base, current: activePlayerBases(state).length, limit: baseLimitForCivilization(state.civilization?.level) };
  }
}
