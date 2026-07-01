import { activePlayerBases } from './player-bases.js';

function markEnemyBaseNetworkDirty(state) {
  state.combat ??= {};
  state.combat.waves ??= { active: {}, resourceBaseCheckClock: 30 };
  state.combat.waves.enemyBaseNetworkDirty = true;
  state.combat.waves.resourceBaseCheckClock = 0;
}

export function clearFrontlineEnemyNetworkForAnchor(state, anchorBaseId) {
  if (!anchorBaseId) return { retiredBases: 0, removedRespawns: 0 };
  let retiredBases = 0;
  const retiredBaseIds = new Set();
  for (const enemyBase of state.world?.enemyBases ?? []) {
    if (enemyBase.frontlineAnchorBaseId !== anchorBaseId) continue;
    if (enemyBase.alive || enemyBase.hp > 0) retiredBases += 1;
    enemyBase.alive = false;
    enemyBase.hp = 0;
    enemyBase.destroyed = false;
    enemyBase.retired = true;
    enemyBase.retiredAt = state.runtime?.worldTimeMs ?? Date.now();
    retiredBaseIds.add(enemyBase.id);
  }
  const beforeRespawns = state.world?.baseRespawns?.length ?? 0;
  if (Array.isArray(state.world?.baseRespawns)) {
    state.world.baseRespawns = state.world.baseRespawns.filter(respawn => respawn.frontlineAnchorBaseId !== anchorBaseId);
  }
  for (const enemy of state.combat?.enemies ?? []) {
    if (!retiredBaseIds.has(enemy.sourceBaseId)) continue;
    enemy.sourceBaseDestroyed = true;
  }
  const removedRespawns = Math.max(0, beforeRespawns - (state.world?.baseRespawns?.length ?? 0));
  if (retiredBases > 0 || removedRespawns > 0) markEnemyBaseNetworkDirty(state);
  return { retiredBases, removedRespawns };
}

function fallbackMajorBase(state, removedBaseId = null) {
  return activePlayerBases(state).find(base => base.id !== removedBaseId) ?? null;
}

export function clearOwnedBaseReferences(state, removedBaseId, fallback = fallbackMajorBase(state, removedBaseId)) {
  if (!removedBaseId) return;
  for (const enemy of state.combat?.enemies ?? []) {
    let changed = false;
    if (enemy.targetPlayerBaseId === removedBaseId) { enemy.targetPlayerBaseId = null; changed = true; }
    if (enemy.targetFieldBaseId === removedBaseId) { enemy.targetFieldBaseId = null; changed = true; }
    if (changed) {
      enemy.path = null;
      enemy.pathIndex = 0;
      enemy.edgeId = null;
      enemy.edgeProgress = 0;
      enemy.reroutePending = true;
    }
  }
  clearFrontlineEnemyNetworkForAnchor(state, removedBaseId);
  for (const squad of state.combat?.friendlySquads ?? []) {
    if (squad.originBaseId === removedBaseId) {
      squad.originBaseId = fallback?.id ?? null;
      if (!fallback) squad.stranded = true;
    }
    if (squad.recoveryBaseId === removedBaseId) {
      squad.recoveryBaseId = fallback?.id ?? null;
      if (!fallback) squad.recoveryInterrupted = true;
    }
  }
}
