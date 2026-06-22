import { distance, stableId } from '../core/utilities.js';
import { addBundle } from '../civilization/inventory-system.js';
import { ENEMY_DEFINITIONS, MAX_ENEMIES } from './definitions.js';
import { findCombatPath } from './routing-system.js';

export function enemyPosition(state, enemy) {
  const graph = state.world.roadGraph;
  if (!enemy.edgeId || !enemy.path) return graph.nodeById.get(enemy.nodeId) ?? { x: 0, y: 0 };
  const edge = graph.edgeById.get(enemy.edgeId);
  const fromId = enemy.path.nodeIds[enemy.pathIndex];
  const toId = enemy.path.nodeIds[enemy.pathIndex + 1];
  const from = graph.nodeById.get(fromId);
  const to = graph.nodeById.get(toId);
  if (!edge || !from || !to) return graph.nodeById.get(enemy.nodeId) ?? { x: 0, y: 0 };
  const t = Math.max(0, Math.min(1, enemy.edgeProgress / Math.max(1, edge.length)));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function spawnEnemy(state, base, type, departDelay = 0, waveId = null) {
  if (state.combat.enemies.length >= MAX_ENEMIES) return null;
  const definition = ENEMY_DEFINITIONS[type];
  if (!definition) return null;
  const enemy = {
    id: stableId('enemy', base.id, type, base.wavesSent, state.combat.enemies.length, state.runtime?.worldTimeMs ?? Date.now()),
    type, hp: definition.hp, maxHp: definition.hp, nodeId: base.nodeId,
    path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay,
    sourceBaseId: base.id, waveId, waveResolved: false, stunnedTowerIds: [], rewardGranted: false, reroutePending: false
  };
  state.combat.enemies.push(enemy);
  return enemy;
}

function targetNodeForEnemy(state, enemy) {
  const definition = ENEMY_DEFINITIONS[enemy.type];
  if (definition.attackTowers) {
    const position = enemyPosition(state, enemy);
    const towers = state.combat.defenses.filter(defense => defense.kind === 'tower' && defense.hp > 0 && !defense.ruined);
    if (towers.length > 0) {
      return towers.reduce((best, tower) => {
        const node = state.world.roadGraph.nodeById.get(tower.nodeId);
        const bestNode = state.world.roadGraph.nodeById.get(best.nodeId);
        return distance(position, node) < distance(position, bestNode) ? tower : best;
      }, towers[0]).nodeId;
    }
  }
  return state.world.city.nodeId;
}

function ensurePath(state, enemy) {
  const targetId = targetNodeForEnemy(state, enemy);
  const currentPathValid = enemy.path?.targetId === targetId && enemy.pathIndex < enemy.path.edgeIds.length;
  if (currentPathValid && !enemy.reroutePending) return true;
  if (enemy.path && enemy.edgeId && enemy.edgeProgress > 0 && enemy.edgeProgress < (state.world.roadGraph.edgeById.get(enemy.edgeId)?.length ?? 0)) {
    enemy.reroutePending = true;
    return true;
  }
  const path = findCombatPath(state, enemy.nodeId, targetId, enemy.type);
  enemy.path = path;
  enemy.pathIndex = 0;
  enemy.edgeId = path?.edgeIds[0] ?? null;
  enemy.edgeProgress = 0;
  enemy.reroutePending = false;
  return Boolean(path);
}

function activeBarrierOnEdge(state, edgeId) {
  return state.combat.defenses.find(defense =>
    defense.kind === 'barrier' && defense.edgeId === edgeId && defense.hp > 0 && !defense.ruined
  ) ?? null;
}

function nearestTower(state, enemy, maxDistance = 18) {
  const position = enemyPosition(state, enemy);
  let best = null;
  let bestDistance = maxDistance;
  for (const defense of state.combat.defenses) {
    if (defense.kind !== 'tower' || defense.hp <= 0 || defense.ruined) continue;
    const node = state.world.roadGraph.nodeById.get(defense.nodeId);
    if (!node) continue;
    const gap = distance(position, node);
    if (gap < bestDistance) { best = defense; bestDistance = gap; }
  }
  return best;
}

function resolveWaveEnemy(state, enemy, breached) {
  if (!enemy.waveId || enemy.waveResolved) return;
  enemy.waveResolved = true;
  const record = state.combat.waves.active?.[enemy.waveId];
  if (!record) return;
  record.remaining = Math.max(0, record.remaining - 1);
  if (breached) record.breached = true;
  if (record.remaining > 0) return;
  if (record.breached) state.civilization.progress.perfectWaveStreak = 0;
  else state.civilization.progress.perfectWaveStreak = (state.civilization.progress.perfectWaveStreak ?? 0) + 1;
  delete state.combat.waves.active[enemy.waveId];
}

export function damageEnemy(state, enemy, amount, events = null) {
  if (enemy.hp <= 0 || enemy.rewardGranted) return false;
  if (!(ENEMY_DEFINITIONS[enemy.type]?.shieldAura > 0)) {
    const position = enemyPosition(state, enemy);
    const protectedByShield = state.combat.enemies.some(other =>
      other !== enemy && other.hp > 0 && (ENEMY_DEFINITIONS[other.type]?.shieldAura > 0) && distance(enemyPosition(state, other), position) <= 14
    );
    if (protectedByShield) amount *= 0.7;
  }
  enemy.hp -= amount;
  if (enemy.hp > 0) return false;
  enemy.hp = 0;
  enemy.rewardGranted = true;
  const definition = ENEMY_DEFINITIONS[enemy.type];
  let drops = { ...(definition.drops ?? {}) };
  const sourceBase = state.world.enemyBases.find(base => base.id === enemy.sourceBaseId);
  if (['miner', 'oreCarrier'].includes(enemy.type)) {
    if (sourceBase?.type === 'tinCamp') drops = { stone: drops.stone ?? 2, tinOre: Math.max(1, drops.tinOre ?? 1) };
    if (sourceBase?.type === 'ironCamp') drops = { stone: drops.stone ?? 2, ironOre: Math.max(1, drops.ironOre ?? 1) };
  }
  addBundle(state, drops);
  resolveWaveEnemy(state, enemy, false);
  state.statistics.kills += 1;
  if (enemy.type === 'siegeCaptain') {
    state.civilization.progress.bossesDefeated.siegeCaptain = (state.civilization.progress.bossesDefeated.siegeCaptain ?? 0) + 1;
  }
  events?.emit('combat:enemy-killed', { enemyId: enemy.id, position: enemyPosition(state, enemy), type: enemy.type, drops });
  return true;
}

export class EnemySystem {
  constructor(events) { this.events = events; }

  invalidateAllPaths(state) {
    for (const enemy of state.combat.enemies) enemy.reroutePending = true;
  }

  updateEnemy(state, enemy, deltaSeconds) {
    if (enemy.departDelay > 0) {
      enemy.departDelay = Math.max(0, enemy.departDelay - deltaSeconds);
      return false;
    }
    enemy.slowTimer = Math.max(0, enemy.slowTimer - deltaSeconds);
    const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
    if (!ensurePath(state, enemy) || !enemy.edgeId) return false;

    if (definition.attackTowers) {
      const tower = nearestTower(state, enemy, 20);
      if (tower) {
        if (!enemy.stunnedTowerIds.includes(tower.id)) {
          enemy.stunnedTowerIds.push(tower.id);
          tower.disabledTimer = Math.max(tower.disabledTimer ?? 0, definition.stunSeconds ?? 8);
          this.events?.emit('message', { text: '破壊工作員が防衛施設を停止させました。' });
        }
        tower.hp -= definition.towerDps * deltaSeconds;
        if (tower.hp <= 0 && !tower.ruined) {
          tower.hp = 0;
          tower.ruined = true;
          this.events?.emit('combat:defense-destroyed', { defenseId: tower.id });
        }
        return false;
      }
    }

    const graph = state.world.roadGraph;
    const edge = graph.edgeById.get(enemy.edgeId);
    if (!edge) { enemy.path = null; return false; }

    const barrier = activeBarrierOnEdge(state, edge.id);
    const barrierPosition = edge.length * 0.5;
    if (barrier && enemy.edgeProgress >= barrierPosition - 1 && enemy.edgeProgress <= barrierPosition + 2) {
      enemy.attackClock += deltaSeconds;
      if (enemy.attackClock >= 0.5) {
        enemy.attackClock = 0;
        barrier.hp -= definition.barrierDps * 0.5;
        if (barrier.hp <= 0) {
          barrier.hp = 0;
          barrier.ruined = true;
          this.invalidateAllPaths(state);
          this.events?.emit('message', { text: '防壁が破壊され、敵の流れが変わりました。' });
        }
      }
      return false;
    }

    let commanderMultiplier = 1;
    if (enemy.type !== 'commander') {
      const position = enemyPosition(state, enemy);
      const commanded = state.combat.enemies.some(other => other.hp > 0 && other.type === 'commander' && distance(enemyPosition(state, other), position) <= 35);
      if (commanded) commanderMultiplier = 1 + (ENEMY_DEFINITIONS.commander.commanderAura ?? 0);
    }
    const slowBase = enemy.slowMultiplier ?? 0.52;
    const slowMultiplier = enemy.slowTimer > 0
      ? 1 - (1 - slowBase) * (1 - (definition.slowResistance ?? 0))
      : 1;
    enemy.edgeProgress += definition.speed * commanderMultiplier * slowMultiplier * deltaSeconds;

    if (enemy.edgeProgress < edge.length) return false;
    enemy.nodeId = enemy.path.nodeIds[enemy.pathIndex + 1];
    enemy.pathIndex += 1;
    enemy.edgeProgress = 0;

    if (enemy.reroutePending && enemy.nodeId !== enemy.path.targetId) {
      enemy.path = null;
      enemy.pathIndex = 0;
      enemy.edgeId = null;
      enemy.reroutePending = false;
      return false;
    }

    if (enemy.nodeId === enemy.path.targetId) {
      if (enemy.path.targetId === state.world.city.nodeId) {
        state.world.city.hp = Math.max(0, state.world.city.hp - definition.cityDamage);
        if ((definition.settlementDamage ?? 0) > 0) {
          state.combat.pendingSettlementDamage ??= [];
          state.combat.pendingSettlementDamage.push({ enemyId: enemy.id, enemyType: enemy.type, damage: definition.settlementDamage });
        }
        resolveWaveEnemy(state, enemy, true);
        this.events?.emit('combat:city-hit', { damage: definition.cityDamage, enemyId: enemy.id });
        return true;
      }
      const tower = state.combat.defenses.find(defense =>
        defense.kind === 'tower' && defense.nodeId === enemy.path.targetId && defense.hp > 0 && !defense.ruined
      );
      if (tower) {
        tower.hp -= definition.barrierDps * 1.5;
        if (tower.hp <= 0) { tower.hp = 0; tower.ruined = true; }
        enemy.path = null;
        return false;
      }
    }

    if (enemy.pathIndex >= enemy.path.edgeIds.length) { enemy.path = null; return false; }
    enemy.edgeId = enemy.path.edgeIds[enemy.pathIndex];
    return false;
  }

  update(state, deltaSeconds) {
    const remove = new Set();
    for (const enemy of state.combat.enemies) {
      if (enemy.hp <= 0 || this.updateEnemy(state, enemy, deltaSeconds)) remove.add(enemy.id);
    }
    if (remove.size > 0) state.combat.enemies = state.combat.enemies.filter(enemy => !remove.has(enemy.id) && enemy.hp > 0);
  }
}
