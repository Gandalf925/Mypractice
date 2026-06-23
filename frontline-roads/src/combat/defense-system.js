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
        const count = spatial.query(candidate.position, definition.blastRadius)
          .filter(entry => entry.enemy.hp > 0).length;
        if (count > bestCount) { best = candidate; bestCount = count; }
      }
      tower.cooldown = definition.cooldown;
      const hit = best.position;
      const maximumTargets = Math.max(1, Number(definition.maxTargets) || 1);
      const splashMultiplier = Math.max(0, Math.min(1, Number(definition.splashMultiplier) || 0));
      const blastTargets = spatial.query(hit, definition.blastRadius)
        .filter(entry => entry.enemy.hp > 0)
        .sort((a, b) => {
          if (a.enemy.id === best.enemy.id) return -1;
          if (b.enemy.id === best.enemy.id) return 1;
          return distance(a.position, hit) - distance(b.position, hit);
        })
        .slice(0, maximumTargets);
      for (const [index, entry] of blastTargets.entries()) {
        const damage = index === 0 ? definition.damage : definition.damage * splashMultiplier;
        damageEnemy(state, entry.enemy, damage, this.events, spatial);
      }
      this.events?.emit('combat:explosion', { position: hit, radius: definition.blastRadius, targets: blastTargets.length });
      return;
    }

    if (tower.type === 'slow') {
      tower.cooldown = definition.cooldown;
      const affected = [...targets]
        .sort((a, b) => distance(a.position, position) - distance(b.position, position))
        .slice(0, definition.maxTargets);
      for (const entry of affected) {
        const enemy = entry.enemy;
        enemy.slowTimer = Math.max(enemy.slowTimer, definition.slowSeconds);
        enemy.slowMultiplier = 1 - definition.slow;
        damageEnemy(state, enemy, definition.damage, this.events, spatial);
      }
      this.events?.emit('combat:shot', { type: tower.type, from: position, to: affected[0].position });
    }
  }

  update(state, deltaSeconds, spatial = null, shouldUpdate = null) {
    spatial ??= buildCombatSpatialIndex(state);
    for (const defense of state.combat.defenses) {
      if (defense.kind !== 'tower' || (shouldUpdate && !shouldUpdate(defense))) continue;
      this.updateTower(state, defense, deltaSeconds, spatial);
    }
    state.combat.enemies = state.combat.enemies.filter(enemy => enemy.hp > 0);
  }
}
