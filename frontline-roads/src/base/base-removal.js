import { activePlayerBases } from './player-bases.js';

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
  if (!fallback) return;
  for (const squad of state.combat?.friendlySquads ?? []) {
    if (squad.originBaseId === removedBaseId) squad.originBaseId = fallback.id;
    if (squad.recoveryBaseId === removedBaseId) squad.recoveryBaseId = fallback.id;
  }
}
