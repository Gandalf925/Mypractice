import { ENEMY_DEFINITIONS } from '../combat/definitions.js';
import { enemyPosition } from '../combat/enemy-system.js';

export const THREAT_LEVELS = Object.freeze({
  CLEAR: { key: 'clear', label: 'CLEAR', color: '#65ffd0' },
  CONTACT: { key: 'contact', label: 'CONTACT', color: '#ffd166' },
  ENGAGED: { key: 'engaged', label: 'ENGAGED', color: '#ff9f43' },
  CRITICAL: { key: 'critical', label: 'CRITICAL', color: '#ff5268' }
});

export function remainingRouteDistance(state, enemy) {
  const graph = state?.world?.roadGraph;
  const path = enemy?.path;
  if (!graph || !path?.edgeIds?.length) return Infinity;
  let remaining = 0;
  const currentEdge = enemy.edgeId ? graph.edgeById.get(enemy.edgeId) : null;
  if (currentEdge) remaining += Math.max(0, currentEdge.length - (enemy.edgeProgress ?? 0));
  const start = Math.max(0, (enemy.pathIndex ?? 0) + (currentEdge ? 1 : 0));
  for (let index = start; index < path.edgeIds.length; index += 1) {
    remaining += graph.edgeById.get(path.edgeIds[index])?.length ?? 0;
  }
  return remaining;
}

export function enemyThreatScore(state, enemy) {
  const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
  const remaining = remainingRouteDistance(state, enemy);
  const proximity = Number.isFinite(remaining) ? Math.max(0, 260 - remaining) * 0.55 : 0;
  const damage = (definition.cityDamage ?? 0) * 4;
  const durability = Math.min(50, (enemy.hp / Math.max(1, enemy.maxHp)) * (definition.hp ?? enemy.maxHp ?? 0) * 0.15);
  const special = (definition.settlementDamage ?? 0) * 1.2 + (definition.attackTowers ? 18 : 0);
  return proximity + damage + durability + special;
}

export function analyzeThreat(state) {
  const enemies = (state?.combat?.enemies ?? []).filter(enemy => enemy.hp > 0 && (enemy.departDelay ?? 0) <= 0);
  const cityHp = state?.world?.city?.hp ?? 100;
  const cityMaxHp = Math.max(1, state?.world?.city?.maxHp ?? 100);
  const cityRatio = cityHp / cityMaxHp;
  const distances = enemies.map(enemy => remainingRouteDistance(state, enemy)).filter(Number.isFinite);
  const nearestDistance = distances.length ? Math.min(...distances) : Infinity;
  const breachPotential = enemies.reduce((sum, enemy) => {
    const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
    return sum + (definition.cityDamage ?? 0);
  }, 0);
  const bossPresent = enemies.some(enemy => {
    const definition = ENEMY_DEFINITIONS[enemy.type] ?? {};
    return (definition.cityDamage ?? 0) >= 18 || (definition.hp ?? 0) >= 160;
  });

  let level = THREAT_LEVELS.CLEAR;
  if (enemies.length > 0) level = THREAT_LEVELS.CONTACT;
  if (enemies.length >= 8 || nearestDistance <= 150 || bossPresent) level = THREAT_LEVELS.ENGAGED;
  if (cityRatio <= 0.3 || nearestDistance <= 42 || breachPotential >= 70) level = THREAT_LEVELS.CRITICAL;

  const nearestText = Number.isFinite(nearestDistance) ? `${Math.max(0, Math.round(nearestDistance))}m` : '--';
  const detail = enemies.length === 0
    ? '接触なし / 防衛線安定'
    : `接触 ${enemies.length} / 最近 ${nearestText}${bossPresent ? ' / 重脅威' : ''}`;

  return {
    ...level,
    enemyCount: enemies.length,
    nearestDistance,
    breachPotential,
    bossPresent,
    cityRatio,
    detail,
    priorityEnemies: [...enemies]
      .sort((a, b) => enemyThreatScore(state, b) - enemyThreatScore(state, a))
      .slice(0, 8)
  };
}

export function enemyRouteWorldPoints(state, enemy, maximumEdges = 5) {
  const graph = state?.world?.roadGraph;
  if (!graph || !enemy?.path?.nodeIds?.length) return [];
  const points = [enemyPosition(state, enemy)];
  const startNodeIndex = Math.max(0, (enemy.pathIndex ?? 0) + 1);
  const endNodeIndex = Math.min(enemy.path.nodeIds.length, startNodeIndex + maximumEdges);
  for (let index = startNodeIndex; index < endNodeIndex; index += 1) {
    const node = graph.nodeById.get(enemy.path.nodeIds[index]);
    if (node) points.push(node);
  }
  return points;
}
