import { distance } from '../core/utilities.js';
import { ENEMY_DEFINITIONS } from './definitions.js';
import { edgeMidpoint } from './combat-geometry.js';

function defenseMaps(state) {
  const barriers = new Map();
  const towers = [];
  for (const defense of state.combat.defenses) {
    if (defense.hp <= 0 || defense.ruined) continue;
    if (defense.kind === 'barrier') barriers.set(defense.edgeId, defense);
    else towers.push(defense);
  }
  return { barriers, towers };
}

function edgeEnemyCount(state, edgeId) {
  let count = 0;
  for (const enemy of state.combat.enemies) if (enemy.edgeId === edgeId && enemy.hp > 0) count += 1;
  return count;
}

function edgeTowerThreat(state, edgeId, towers) {
  const graph = state.world.roadGraph;
  const middle = edgeMidpoint(graph, edgeId);
  if (!middle) return 0;
  let threat = 0;
  for (const tower of towers) {
    if (tower.kind !== 'tower' || tower.type === 'relay') continue;
    const node = graph.nodeById.get(tower.nodeId);
    const range = tower.range ?? 80;
    if (node && distance(middle, node) <= range) threat += 1;
  }
  return threat;
}

export function findCombatPath(state, startId, targetId, enemyType = 'infantry', previewBarrierEdgeId = null) {
  const graph = state.world.roadGraph;
  const enemyDefinition = ENEMY_DEFINITIONS[enemyType] ?? ENEMY_DEFINITIONS.infantry;
  const { barriers, towers } = defenseMaps(state);
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = [{ id: startId, distance: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.id === targetId) break;

    for (const connection of graph.adjacency.get(current.id) ?? []) {
      const edge = graph.edgeById.get(connection.edgeId);
      let weight = edge.length;
      const barrier = connection.edgeId === previewBarrierEdgeId
        ? { hp: ENEMY_DEFINITIONS.engineer.hp + 160 }
        : barriers.get(connection.edgeId);
      if (barrier?.hp > 0) weight += enemyDefinition.engineer ? 8 + barrier.hp * 0.04 : 12000;
      if (enemyDefinition.avoidTowers) weight *= 1 + edgeTowerThreat(state, edge.id, towers) * 0.9;
      if (enemyDefinition.avoidCongestion) weight *= 1 + edgeEnemyCount(state, edge.id) / 12;
      const nextDistance = current.distance + weight;
      if (nextDistance >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, nextDistance);
      previous.set(connection.to, { from: current.id, edgeId: connection.edgeId });
      queue.push({ id: connection.to, distance: nextDistance });
    }
  }

  if (!distances.has(targetId)) return null;
  const nodeIds = [targetId];
  const edgeIds = [];
  let cursor = targetId;
  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) return null;
    edgeIds.push(step.edgeId);
    nodeIds.push(step.from);
    cursor = step.from;
  }
  nodeIds.reverse();
  edgeIds.reverse();
  return { nodeIds, edgeIds, cost: distances.get(targetId), targetId };
}
