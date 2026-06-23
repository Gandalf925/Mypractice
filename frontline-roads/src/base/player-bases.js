import { distance, stableId } from '../core/utilities.js';

export const PLAYER_BASE_MINIMUM_SEPARATION_METERS = 220;
export const PLAYER_BASE_PLACEMENT_RANGE_METERS = 50;
export const PLAYER_BASE_REBUILD_COST = Object.freeze({ timber: 6, rope: 3, cutStone: 6 });
export const PLAYER_BASE_PLACEMENT_COSTS = Object.freeze({
  2: Object.freeze({ timber: 8, rope: 4, cutStone: 8 }),
  3: Object.freeze({ timber: 14, rope: 6, cutStone: 14 }),
  4: Object.freeze({ timber: 20, rope: 8, cutStone: 20, bronzeIngot: 4 }),
  5: Object.freeze({ timber: 26, rope: 10, cutStone: 28, wroughtIron: 4 })
});

export function playerBaseSlotsUsed(state) {
  return ensurePlayerBaseState(state).length;
}

export function playerBasePlacementCost(state) {
  const targetCount = playerBaseSlotsUsed(state) + 1;
  return { ...(PLAYER_BASE_PLACEMENT_COSTS[targetCount] ?? PLAYER_BASE_PLACEMENT_COSTS[5]) };
}

function finite(value) {
  return Number.isFinite(Number(value));
}

export function baseLimitForCivilization(level) {
  return Math.max(1, Math.floor(Number(level) || 0) + 1);
}

export function ensurePlayerBaseState(state) {
  state.world.playerBases = Array.isArray(state.world.playerBases) ? state.world.playerBases : [];
  const home = state.world.homeBase;
  if (home?.status === 'ESTABLISHED' && !state.world.playerBases.some(base => base.id === home.id)) {
    state.world.playerBases.unshift({
      ...home,
      name: '本拠地',
      primary: true,
      hp: state.world.city?.hp ?? 100,
      maxHp: state.world.city?.maxHp ?? 100,
      establishedAt: home.establishedAt ?? Date.now()
    });
  }
  for (let index = 0; index < state.world.playerBases.length; index += 1) {
    const base = state.world.playerBases[index];
    base.id ??= stableId('player_base', base.nodeId, base.establishedAt ?? index);
    base.name = String(base.name || (index === 0 ? '本拠地' : `主要拠点 ${index + 1}`));
    if (index > 0 && /^前線拠点 \d+$/.test(base.name)) base.name = `主要拠点 ${index + 1}`;
    base.status = base.status === 'DESTROYED' ? 'DESTROYED' : 'ESTABLISHED';
    base.primary = index === 0 || Boolean(base.primary && !state.world.playerBases.slice(0, index).some(item => item.primary));
    base.maxHp = Math.max(1, Number(base.maxHp) || 100);
    base.hp = Math.max(0, Math.min(base.maxHp, Number(base.hp ?? base.maxHp) || 0));
    const node = state.world.roadGraph?.nodeById?.get(base.nodeId);
    if ((!finite(base.x) || !finite(base.y)) && node) {
      base.x = node.x;
      base.y = node.y;
    }
  }
  if (state.world.playerBases.length) {
    state.world.playerBases.forEach((base, index) => { base.primary = index === 0; });
    const primary = state.world.playerBases[0];
    state.world.homeBase = { ...state.world.homeBase, ...primary, primary: undefined };
    if (state.world.city) {
      state.world.city.nodeId = primary.nodeId;
      primary.hp = Math.max(0, Number(state.world.city.hp ?? primary.hp));
      primary.maxHp = Math.max(1, Number(state.world.city.maxHp ?? primary.maxHp));
    }
  }
  return state.world.playerBases;
}

export function playerBaseById(state, baseId, { includeDestroyed = true } = {}) {
  const base = ensurePlayerBaseState(state).find(item => item.id === baseId) ?? null;
  if (!base || (!includeDestroyed && (base.status !== 'ESTABLISHED' || base.hp <= 0))) return null;
  return base;
}

export function activePlayerBases(state) {
  return ensurePlayerBaseState(state).filter(base => base.status === 'ESTABLISHED' && base.hp > 0);
}

export function nearestPlayerBase(state, point) {
  if (!point) return null;
  return activePlayerBases(state)
    .map(base => ({ base, gap: distance(base, point) }))
    .sort((a, b) => a.gap - b.gap)[0] ?? null;
}

export function canPlaceAdditionalBase(state, point) {
  const bases = ensurePlayerBaseState(state);
  if (bases.length >= baseLimitForCivilization(state.civilization?.level)) {
    return { ok: false, reason: '文明レベルに対する拠点上限へ到達しています。' };
  }
  const nearest = bases
    .map(base => ({ base, gap: distance(base, point) }))
    .sort((a, b) => a.gap - b.gap)[0] ?? null;
  if (nearest && nearest.gap < PLAYER_BASE_MINIMUM_SEPARATION_METERS) {
    return { ok: false, reason: `既存拠点から${PLAYER_BASE_MINIMUM_SEPARATION_METERS}m以上離れてください。`, nearest };
  }
  return { ok: true, nearest };
}
