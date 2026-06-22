import { distance } from '../core/utilities.js';
import { consumeBundle } from '../civilization/inventory-system.js';
import { repairCostForDefense } from '../civilization/repair-cost.js';
import { defenseRuntimeDefinition } from './definitions.js';
import { edgeMidpoint } from './combat-geometry.js';
import { damageEnemy } from './enemy-system.js';
import { buildCombatSpatialIndex } from './combat-spatial-index.js';

function nearestEntry(entries, point) {
  let best = null;
  let bestDistance = Infinity;
  for (const entry of entries) {
    if (entry.enemy.hp <= 0) continue;
    const gap = distance(entry.position, point);
    if (gap < bestDistance) { best = entry; bestDistance = gap; }
  }
  return best;
}

export class DefenseSystem {
  constructor(events) { this.events = events; }

  updateTower(state, tower, deltaSeconds, spatial) {
    if (tower.ruined || tower.hp <= 0) return;
    tower.disabledTimer = Math.max(0, (tower.disabledTimer ?? 0) - deltaSeconds);
    if (tower.disabledTimer > 0) return;
    tower.cooldown = Math.max(0, (tower.cooldown ?? 0) - deltaSeconds);
    if (tower.cooldown > 0) return;

    const definition = defenseRuntimeDefinition(tower);
    const graph = state.world.roadGraph;
    const position = graph.nodeById.get(tower.nodeId);
    if (!definition || !position) return;

    if (tower.type === 'relay') {
      let target = null;
      let mostMissing = 0;
      for (const defense of state.combat.defenses) {
        if (defense === tower || defense.ruined || defense.hp <= 0 || defense.hp >= defense.maxHp) continue;
        const targetPosition = defense.kind === 'barrier' ? edgeMidpoint(graph, defense.edgeId) : graph.nodeById.get(defense.nodeId);
        if (!targetPosition || distance(position, targetPosition) > definition.range) continue;
        const missing = defense.maxHp - defense.hp;
        if (missing > mostMissing) { target = defense; mostMissing = missing; }
      }
      if (!target) return;
      const repairLimit = target.kind === 'barrier' ? definition.repairBarrier : definition.repairTower;
      const repairHp = Math.min(repairLimit, target.maxHp - target.hp);
      const cost = repairCostForDefense(target, repairHp);
      if (!consumeBundle(state, cost)) return;
      tower.cooldown = definition.cooldown;
      target.hp = Math.min(target.maxHp, target.hp + repairHp);
      state.civilization.progress.totalRepairHpPaid += repairHp;
      this.events?.emit('combat:defense-repaired', { defenseId: target.id, repairHp, cost, automatic: true });
      return;
    }

    const targets = spatial.query(position, definition.range).filter(entry => entry.enemy.hp > 0);
    if (targets.length === 0) return;

    if (tower.type === 'gun') {
      const target = nearestEntry(targets, position);
      if (!target) return;
      tower.cooldown = definition.cooldown;
      damageEnemy(state, target.enemy, definition.damage, this.events, spatial);
      this.events?.emit('combat:shot', { type: tower.type, from: position, to: target.position });
      return;
    }

    if (tower.type === 'mortar') {
      let best = targets[0];
      let bestCount = -1;
      for (const candidate of targets) {
        const count = spatial.query(candidate.position, Math.min(32, definition.blastRadius ?? 28)).filter(entry => entry.enemy.hp > 0).length;
        if (count > bestCount) { best = candidate; bestCount = count; }
      }
      tower.cooldown = definition.cooldown;
      const hit = best.position;
      for (const entry of spatial.query(hit, definition.blastRadius)) {
        if (entry.enemy.hp > 0) damageEnemy(state, entry.enemy, definition.damage, this.events, spatial);
      }
      this.events?.emit('combat:explosion', { position: hit, radius: definition.blastRadius });
      return;
    }

    if (tower.type === 'slow') {
      tower.cooldown = definition.cooldown;
      for (const entry of targets.slice(0, definition.maxTargets)) {
        const enemy = entry.enemy;
        enemy.slowTimer = Math.max(enemy.slowTimer, definition.slowSeconds);
        enemy.slowMultiplier = 1 - definition.slow;
        damageEnemy(state, enemy, definition.damage, this.events, spatial);
      }
      this.events?.emit('combat:shot', { type: tower.type, from: position, to: targets[0].position });
    }
  }

  update(state, deltaSeconds, spatial = null) {
    spatial ??= buildCombatSpatialIndex(state);
    for (const defense of state.combat.defenses) if (defense.kind === 'tower') this.updateTower(state, defense, deltaSeconds, spatial);
    state.combat.enemies = state.combat.enemies.filter(enemy => enemy.hp > 0);
  }
}
