import { stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS } from './definitions.js';
import { createBaseRecoveryItem } from '../exploration/recovery-system.js';

const BASE_RESPAWN_MIN_SECONDS = 4 * 60 * 60;
const BASE_RESPAWN_MAX_SECONDS = 6 * 60 * 60;

function deterministicRespawnSeconds(baseId) {
  let hash = 2166136261;
  for (const character of String(baseId)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const span = BASE_RESPAWN_MAX_SECONDS - BASE_RESPAWN_MIN_SECONDS;
  return BASE_RESPAWN_MIN_SECONDS + ((hash >>> 0) % (span + 1));
}

export function scheduleEnemyBaseRespawn(state, base) {
  state.world.baseRespawns ??= [];
  if (state.world.baseRespawns.some(item => item.sourceBaseId === base.id)) return null;
  const respawn = {
    id: stableId('respawn', base.id, state.statistics.campsCaptured),
    sourceBaseId: base.id,
    baseType: base.type,
    sourceNodeId: base.nodeId,
    remainingSec: deterministicRespawnSeconds(base.id),
    attempts: 0
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
  const recoveryItem = createBaseRecoveryItem(state, base);
  for (const enemy of state.combat.enemies) {
    if (enemy.sourceBaseId === base.id) enemy.sourceBaseDestroyed = true;
  }
  const definition = ENEMY_BASE_DEFINITIONS[base.type];
  events?.emit('combat:enemy-base-destroyed', { baseId: base.id, base, cause, recoveryItem });
  events?.emit('message', { text: `${definition?.name ?? '敵拠点'}を破壊しました。現地に特殊回収物が残されています。` });
  return true;
}
