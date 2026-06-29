export function clearOwnedBaseReferences(state, removedBaseId) {
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
}
