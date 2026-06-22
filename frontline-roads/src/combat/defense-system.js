import { distance } from '../core/utilities.js';
import { consumeBundle } from '../civilization/inventory-system.js';
import { repairCostForDefense } from '../civilization/repair-cost.js';
import { defenseRuntimeDefinition } from './definitions.js';
import { edgeMidpoint } from './combat-geometry.js';
import { damageEnemy, enemyPosition } from './enemy-system.js';

function enemiesInRange(state, point, range) {
  return state.combat.enemies.filter(enemy => enemy.hp > 0 && distance(enemyPosition(state, enemy), point) <= range);
}

export class DefenseSystem {
  constructor(events) {
    this.events = events;
  }

  updateTower(state, tower, deltaSeconds) {
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
      const candidates = [];
      for (const defense of state.combat.defenses) {
        if (defense === tower || defense.ruined || defense.hp <= 0 || defense.hp >= defense.maxHp) continue;
        const targetPosition = defense.kind === 'barrier' ? edgeMidpoint(graph, defense.edgeId) : graph.nodeById.get(defense.nodeId);
        if (!targetPosition || distance(position, targetPosition) > definition.range) continue;
        candidates.push({ defense, missingHp: defense.maxHp - defense.hp });
      }
      candidates.sort((a, b) => b.missingHp - a.missingHp);
      const target = candidates[0]?.defense;
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

    const targets = enemiesInRange(state, position, definition.range);
    if (targets.length === 0) return;

    if (tower.type === 'gun') {
      const target = targets.sort((a, b) => distance(enemyPosition(state, a), position) - distance(enemyPosition(state, b), position))[0];
      tower.cooldown = definition.cooldown;
      damageEnemy(state, target, definition.damage, this.events);
      this.events?.emit('combat:shot', { type: tower.type, from: position, to: enemyPosition(state, target) });
      return;
    }

    if (tower.type === 'mortar') {
      let best = targets[0];
      let bestCount = 0;
      for (const candidate of targets) {
        const candidatePosition = enemyPosition(state, candidate);
        const count = targets.filter(other => distance(enemyPosition(state, other), candidatePosition) < 28).length;
        if (count > bestCount) { best = candidate; bestCount = count; }
      }
      tower.cooldown = definition.cooldown;
      const hit = enemyPosition(state, best);
      for (const enemy of state.combat.enemies) {
        if (enemy.hp > 0 && distance(enemyPosition(state, enemy), hit) < definition.blastRadius) damageEnemy(state, enemy, definition.damage, this.events);
      }
      this.events?.emit('combat:explosion', { position: hit, radius: definition.blastRadius });
      return;
    }

    if (tower.type === 'slow') {
      tower.cooldown = definition.cooldown;
      for (const enemy of targets.slice(0, definition.maxTargets)) {
        enemy.slowTimer = Math.max(enemy.slowTimer, definition.slowSeconds);
        enemy.slowMultiplier = 1 - definition.slow;
        damageEnemy(state, enemy, definition.damage, this.events);
      }
      this.events?.emit('combat:shot', { type: tower.type, from: position, to: enemyPosition(state, targets[0]) });
    }
  }

  update(state, deltaSeconds) {
    for (const defense of state.combat.defenses) if (defense.kind === 'tower') this.updateTower(state, defense, deltaSeconds);
    state.combat.enemies = state.combat.enemies.filter(enemy => enemy.hp > 0);
  }
}
