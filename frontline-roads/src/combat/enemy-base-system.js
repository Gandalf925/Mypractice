import { stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS } from './definitions.js';
import { createBaseRecoveryItem } from '../exploration/recovery-system.js';

export const BASE_RESPAWN_MIN_SECONDS = 4 * 60 * 60;
export const BASE_RESPAWN_MAX_SECONDS = 6 * 60 * 60;
// All enemy facility replenishment is measured in hours, not minutes.
// Resource camps are tied to civilization progress, but their rewards are sized so
// a single capture can satisfy the immediate bronze-entry requirements. Keeping
// respawn in multi-hour windows gives casual players time to react.
export const RESOURCE_BASE_RESPAWN_MIN_SECONDS = 3 * 60 * 60;
export const RESOURCE_BASE_RESPAWN_MAX_SECONDS = 5 * 60 * 60;

function deterministicRespawnSeconds(baseId, resourceBase = false) {
  let hash = 2166136261;
  for (const character of String(baseId)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const minimum = resourceBase ? RESOURCE_BASE_RESPAWN_MIN_SECONDS : BASE_RESPAWN_MIN_SECONDS;
  const maximum = resourceBase ? RESOURCE_BASE_RESPAWN_MAX_SECONDS : BASE_RESPAWN_MAX_SECONDS;
  const span = maximum - minimum;
  return minimum + ((hash >>> 0) % (span + 1));
}

export function scheduleEnemyBaseRespawn(state, base) {
  state.world.baseRespawns ??= [];
  if (state.world.baseRespawns.some(item => item.sourceBaseId === base.id)) return null;
  const respawn = {
    id: stableId('respawn', base.id, state.statistics.campsCaptured),
    sourceBaseId: base.id,
    baseType: base.type,
    sourceNodeId: base.nodeId,
    remainingSec: deterministicRespawnSeconds(base.id, Boolean(ENEMY_BASE_DEFINITIONS[base.type]?.isResourceBase)),
    attempts: 0,
    frontlineAnchorBaseId: base.frontlineAnchorBaseId ?? null,
    frontlineAnchorNodeId: base.frontlineAnchorNodeId ?? null
  };
  state.world.baseRespawns.push(respawn);
  return respawn;
}

export function destroyEnemyBase(state, base, events = null, cause = {}) {
  if (!base?.alive || base.hp > 0) return false;
  base.hp = 0;
  base.alive = false;
  base.destroyed = true;
  base.destroyedAt = state.runtime?.worldTimeMs ?? Date.now();
  state.statistics.campsCaptured = (state.statistics.campsCaptured ?? 0) + 1;
  state.civilization.progress.campsCapturedByType[base.type] = (state.civilization.progress.campsCapturedByType[base.type] ?? 0) + 1;
  scheduleEnemyBaseRespawn(state, base);
  const definition = ENEMY_BASE_DEFINITIONS[base.type];
  const reward = { ...(definition?.reward ?? {}) };
  const recoveryItem = createBaseRecoveryItem(state, base, reward);
  for (const enemy of state.combat.enemies) {
    if (enemy.sourceBaseId === base.id) enemy.sourceBaseDestroyed = true;
  }
  base.rewardAssigned = true;
  events?.emit('combat:enemy-base-destroyed', { baseId: base.id, base, cause, recoveryItem, reward });
  events?.emit('message', { text: `${definition?.name ?? 'Enemy base'} destroyed. A recovery item and resource stockpile remain in the field.` });
  return true;
}
