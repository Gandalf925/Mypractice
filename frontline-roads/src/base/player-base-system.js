import { distance, stableId } from '../core/utilities.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';
import { consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { clearOwnedBaseReferences } from './base-removal.js';
import { stabilizeFriendlySquadsAfterOwnedBaseChanges } from '../combat/friendly-force-system.js';
import { collapsePlayerTerritory } from './base-collapse.js';
import {
  PLAYER_BASE_MINIMUM_SEPARATION_METERS,
  PLAYER_BASE_PLACEMENT_RANGE_METERS,
  activePlayerBases,
  ensurePlayerBaseState,
  playerBaseById,
  playerBaseSlotsUsed,
  PLAYER_BASE_REBUILD_COST,
  baseLimitForCivilization,
  canPlaceAdditionalBase,
  playerBasePlacementCost,
  majorBaseMaxHpForCivilization
} from './player-bases.js';

export const PLAYER_BASE_LOCATION_MAX_AGE_MS = 5 * 60_000;
export const PLAYER_BASE_MAX_ACCURACY_METERS = 100;


function markEnemyBaseNetworkDirty(state) {
  state.combat ??= {};
  state.combat.waves ??= { active: {}, resourceBaseCheckClock: 30 };
  state.combat.waves.enemyBaseNetworkDirty = true;
  state.combat.waves.resourceBaseCheckClock = 30;
}

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
  const bases = state.world?.playerBases ?? [];
  const limit = baseLimitForCivilization(state.civilization?.level);
  const cost = playerBasePlacementCost(state);
  if (bases.length >= limit) {
    return { ok: false, reason: `Current civilization level allows up to ${limit} major bases.`, current: bases.length, limit, cost };
  }
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: 'Acquire your current location.', current: bases.length, limit, cost };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > PLAYER_BASE_LOCATION_MAX_AGE_MS) {
    return { ok: false, reason: 'Location data is too old to place a base. Refresh your current location.', current: bases.length, limit, cost };
  }
  const accuracy = Number(state.player?.locationAccuracy);
  if (Number.isFinite(accuracy) && accuracy > PLAYER_BASE_MAX_ACCURACY_METERS) {
    return { ok: false, reason: 'Location accuracy is insufficient.', current: bases.length, limit, cost };
  }
  const road = nearestRoadNode(state, player);
  if (!road) {
    return { ok: false, reason: `Move within ${PLAYER_BASE_PLACEMENT_RANGE_METERS} m of an acquired road intersection.`, current: bases.length, limit, cost };
  }
  const separation = canPlaceAdditionalBase(state, road.node);
  if (!separation.ok) return { ...separation, current: bases.length, limit, cost };
  const nearestFieldBase = (state.world.fieldBases ?? [])
    .map(base => ({ base, gap: distance(base, road.node) }))
    .sort((left, right) => left.gap - right.gap)[0] ?? null;
  if (nearestFieldBase && nearestFieldBase.gap < PLAYER_BASE_MINIMUM_SEPARATION_METERS) {
    return { ok: false, reason: `Move at least ${PLAYER_BASE_MINIMUM_SEPARATION_METERS} m away from a simple base.`, nearest: nearestFieldBase, current: bases.length, limit, cost };
  }
  const missing = missingBundle(state, cost);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: 'Resources for placing a major base are insufficient.', missing, cost, current: bases.length, limit, node: road.node };
  }
  return {
    ok: true,
    current: bases.length,
    limit,
    cost,
    node: road.node,
    distanceToRoad: road.distance,
    nearestBaseDistance: separation.nearest?.gap ?? null
  };
}


export function previewPlayerBaseRebuild(state, baseId, now = Date.now()) {
  const cost = { ...PLAYER_BASE_REBUILD_COST };
  const base = playerBaseById(state, baseId, { includeDestroyed: true });
  if (!base) return { ok: false, reason: 'Major base to rebuild was not found.', cost };
  if (base.primary) return { ok: false, reason: 'The home base collapsed and cannot be rebuilt. Place a new home base.', cost, base };
  if (base.status !== 'DESTROYED' && base.hp > 0) return { ok: false, reason: 'This major base is still active.', cost };
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: 'Acquire your current location.', cost };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > PLAYER_BASE_LOCATION_MAX_AGE_MS) return { ok: false, reason: 'Location data is too old to rebuild. Refresh your current location.', cost };
  const gap = distance(player, base);
  if (gap > PLAYER_BASE_PLACEMENT_RANGE_METERS) return { ok: false, reason: `Move within ${PLAYER_BASE_PLACEMENT_RANGE_METERS} m of the destroyed major base.`, cost, base, distance: gap };
  const missing = missingBundle(state, cost);
  if (Object.keys(missing).length) return { ok: false, reason: 'Resources for rebuilding a major base are insufficient.', cost, missing, base };
  return { ok: true, cost, base, distance: gap };
}

export function destroyPlayerBase(state, base, events = null, { enemyId = null } = {}) {
  if (!base || base.status === 'DESTROYED') return false;
  if (base.primary) return collapsePlayerTerritory(state, events, { enemyId, cause: 'primary-base-destroyed' }).ok;
  base.hp = 0;
  base.status = 'DESTROYED';
  base.destroyedAt = state.runtime?.worldTimeMs ?? Date.now();
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.targetPlayerBaseId === base.id) {
      enemy.targetPlayerBaseId = null;
      enemy.reroutePending = true;
    }
  }
  stabilizeFriendlySquadsAfterOwnedBaseChanges(state, events);
  events?.emit('base:player-destroyed', { baseId: base.id, enemyId, position: { x: base.x, y: base.y } });
  events?.emit('message', { text: `${base.name} destroyed. Rebuild it on site.` });
  return true;
}

export function previewPlayerBaseDismantle(state, baseId) {
  const bases = Array.isArray(state.world?.playerBases) ? state.world.playerBases : [];
  const base = bases.find(item => item.id === baseId) ?? null;
  if (!base) return { ok: false, reason: 'Major base to dismantle was not found.' };
  if (base.primary || bases.indexOf(base) === 0) return { ok: false, reason: 'The last remaining major base cannot be dismantled.' };
  if (bases.length <= 1) return { ok: false, reason: 'At least one major base is required.' };
  return { ok: true, base };
}

export function dismantlePlayerBase(state, baseId, events = null) {
  ensurePlayerBaseState(state);
  const preview = previewPlayerBaseDismantle(state, baseId);
  if (!preview.ok) return preview;
  const base = preview.base;
  const index = state.world.playerBases.findIndex(item => item.id === base.id);
  if (index < 0) return { ok: false, reason: 'Major base to dismantle was not found.' };
  state.world.playerBases.splice(index, 1);
  clearOwnedBaseReferences(state, base.id);
  ensurePlayerBaseState(state);
  stabilizeFriendlySquadsAfterOwnedBaseChanges(state, events);
  events?.emit('base:player-dismantled', { baseId: base.id, position: { x: base.x, y: base.y } });
  events?.emit('message', { text: `${base.name} dismantled.` });
  return { ok: true, base };
}

export class PlayerBaseSystem {
  constructor(events = null) {
    this.events = events;
  }

  previewCurrentLocation(state, now = Date.now()) {
    return previewPlayerBasePlacement(state, now);
  }

  establishAtCurrentLocation(state, now = Date.now()) {
    const preview = this.previewCurrentLocation(state, now);
    if (!preview.ok) return preview;
    if (!consumeBundle(state, preview.cost)) return { ok: false, reason: 'Not enough resources to place a major base.', missing: missingBundle(state, preview.cost), cost: preview.cost };
    const establishedAt = state.runtime?.worldTimeMs ?? now;
    const sequence = playerBaseSlotsUsed(state) + 1;
    const base = {
      id: stableId('player_base', preview.node.id, establishedAt, sequence),
      name: `Major Base ${sequence}`,
      status: 'ESTABLISHED',
      primary: false,
      nodeId: preview.node.id,
      x: preview.node.x,
      y: preview.node.y,
      hp: majorBaseMaxHpForCivilization(state.civilization?.level),
      maxHp: majorBaseMaxHpForCivilization(state.civilization?.level),
      establishedAt
    };
    state.world.playerBases.push(base);
    markEnemyBaseNetworkDirty(state);
    this.events?.emit('base:player-established', { base });
    this.events?.emit('message', { text: `${base.name} placed.` });
    return { ok: true, base, cost: preview.cost, current: activePlayerBases(state).length, limit: baseLimitForCivilization(state.civilization?.level) };
  }

  previewRebuild(state, baseId, now = Date.now()) {
    return previewPlayerBaseRebuild(state, baseId, now);
  }

  rebuild(state, baseId, now = Date.now()) {
    const preview = this.previewRebuild(state, baseId, now);
    if (!preview.ok) return preview;
    if (!consumeBundle(state, preview.cost)) return { ok: false, reason: 'Resources were missing immediately before rebuilding the major base.', cost: preview.cost };
    const base = preview.base;
    const wasPrimary = Boolean(base.primary);
    if (wasPrimary) return { ok: false, reason: 'The home base collapsed and cannot be rebuilt. Place a new home base.', cost: preview.cost };
    base.status = 'ESTABLISHED';
    base.hp = base.maxHp = majorBaseMaxHpForCivilization(state.civilization?.level);
    base.destroyedAt = null;
    base.rebuiltAt = state.runtime?.worldTimeMs ?? now;
    markEnemyBaseNetworkDirty(state);
    this.events?.emit('base:player-rebuilt', { base, primary: false });
    this.events?.emit('message', { text: `${base.name} rebuilt.` });
    return { ok: true, base, cost: preview.cost };
  }

  previewDismantle(state, baseId) {
    return previewPlayerBaseDismantle(state, baseId);
  }

  dismantle(state, baseId) {
    return dismantlePlayerBase(state, baseId, this.events);
  }

}
