import { distance, stableId } from '../core/utilities.js';
import { activePlayerBases, ensurePlayerBaseState, playerBaseById } from './player-bases.js';

export const FIELD_BASE_BUILD_RANGE_METERS = 50;
export const FIELD_BASE_PLACEMENT_RANGE_METERS = 100;
export const FIELD_BASE_MAX_HP = 40;
export const FIELD_BASE_MINIMUM_SEPARATION_METERS = 140;
export const FIELD_BASE_ENEMY_EXCLUSION_METERS = 120;
export const FIELD_BASE_ALLOWED_SQUAD_TYPES = Object.freeze(['assault', 'skirmisher', 'retrieval']);
export const FIELD_BASE_PLACEMENT_COSTS = Object.freeze({
  1: Object.freeze({ timber: 4, rope: 2 }),
  2: Object.freeze({ timber: 6, rope: 3, cutStone: 4 }),
  3: Object.freeze({ timber: 8, rope: 4, cutStone: 6, bronzeIngot: 2 }),
  4: Object.freeze({ timber: 10, rope: 5, cutStone: 8, wroughtIron: 2 })
});
export const FIELD_BASE_REBUILD_COST = Object.freeze({ timber: 2, rope: 1 });

export function fieldBasePlacementCost(state) {
  const targetSlot = fieldBaseSlotsUsed(state) + 1;
  return { ...(FIELD_BASE_PLACEMENT_COSTS[targetSlot] ?? FIELD_BASE_PLACEMENT_COSTS[4]) };
}

function finite(value) {
  return Number.isFinite(Number(value));
}

export function fieldBaseLimitForCivilization(level) {
  return Math.max(0, Math.floor(Number(level) || 0));
}

export function ensureFieldBaseState(state) {
  state.world.fieldBases = Array.isArray(state.world.fieldBases) ? state.world.fieldBases : [];
  for (let index = 0; index < state.world.fieldBases.length; index += 1) {
    const base = state.world.fieldBases[index];
    base.id ??= stableId('field_base', base.nodeId, base.establishedAt ?? index);
    base.kind = 'FIELD';
    base.name = String(base.name || `簡易拠点 ${index + 1}`);
    base.maxHp = FIELD_BASE_MAX_HP;
    base.hp = Math.max(0, Math.min(base.maxHp, Number(base.hp ?? base.maxHp) || 0));
    base.status = base.status === 'DESTROYED' || base.hp <= 0 ? 'DESTROYED' : 'ESTABLISHED';
    if (base.status === 'DESTROYED') base.hp = 0;
    const node = state.world.roadGraph?.nodeById?.get(base.nodeId);
    if ((!finite(base.x) || !finite(base.y)) && node) {
      base.x = node.x;
      base.y = node.y;
    }
    base.establishedAt = Number(base.establishedAt) || state.runtime?.worldTimeMs || Date.now();
    base.destroyedAt = base.status === 'DESTROYED' ? Number(base.destroyedAt) || base.establishedAt : null;
  }
  return state.world.fieldBases;
}

export function fieldBaseById(state, baseId, { includeDestroyed = true } = {}) {
  const base = ensureFieldBaseState(state).find(item => item.id === baseId) ?? null;
  if (!base || (!includeDestroyed && (base.status !== 'ESTABLISHED' || base.hp <= 0))) return null;
  return base;
}

export function activeFieldBases(state) {
  return ensureFieldBaseState(state).filter(base => base.status === 'ESTABLISHED' && base.hp > 0);
}

export function activeOwnedBases(state) {
  return [...activePlayerBases(state), ...activeFieldBases(state)];
}

export function deploymentBases(state, squadType = 'assault') {
  const major = activePlayerBases(state).map(base => ({ ...base, kind: 'MAJOR' }));
  const field = FIELD_BASE_ALLOWED_SQUAD_TYPES.includes(squadType)
    ? activeFieldBases(state).map(base => ({ ...base, kind: 'FIELD' }))
    : [];
  return [...major, ...field];
}

export function ownedBaseById(state, baseId, { includeDestroyed = false } = {}) {
  const major = playerBaseById(state, baseId, { includeDestroyed });
  if (major) return major;
  return fieldBaseById(state, baseId, { includeDestroyed });
}

export function nearestOwnedBase(state, point, { includeDestroyed = false } = {}) {
  if (!point) return null;
  const bases = includeDestroyed
    ? [...ensurePlayerBaseState(state), ...ensureFieldBaseState(state)]
    : activeOwnedBases(state);
  return bases
    .map(base => ({ base, gap: distance(base, point) }))
    .sort((a, b) => a.gap - b.gap)[0] ?? null;
}

export function fieldBaseSlotsUsed(state) {
  return ensureFieldBaseState(state).length;
}
