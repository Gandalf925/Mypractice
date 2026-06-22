import { distance } from '../core/utilities.js';
import { ENEMY_DEFINITIONS } from './definitions.js';
import { edgeMidpoint } from './combat-geometry.js';

class MinHeap {
  constructor() { this.items = []; }
  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].distance <= value.distance) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }
  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const root = items[0];
    const tail = items.pop();
    if (items.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= items.length) break;
      let child = left;
      if (right < items.length && items[right].distance < items[left].distance) child = right;
      if (items[child].distance >= tail.distance) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = tail;
    return root;
  }
  get length() { return this.items.length; }
}

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

function enemyCountMap(state) {
  const counts = new Map();
  for (const enemy of state.combat.enemies) {
    if (!enemy.edgeId || enemy.hp <= 0) continue;
    counts.set(enemy.edgeId, (counts.get(enemy.edgeId) ?? 0) + 1);
  }
  return counts;
}

function edgeTowerThreat(state, edgeId, towers, cache) {
  if (cache.has(edgeId)) return cache.get(edgeId);
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
  cache.set(edgeId, threat);
  return threat;
}

export function findCombatPath(state, startId, targetId, enemyType = 'infantry', previewBarrierEdgeId = null) {
  const graph = state.world.roadGraph;
  const enemyDefinition = ENEMY_DEFINITIONS[enemyType] ?? ENEMY_DEFINITIONS.infantry;
  const { barriers, towers } = defenseMaps(state);
  const edgeCounts = enemyDefinition.avoidCongestion ? enemyCountMap(state) : null;
  const threatCache = new Map();
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = new MinHeap();
  queue.push({ id: startId, distance: 0 });

  while (queue.length > 0) {
    const current = queue.pop();
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
      if (enemyDefinition.avoidTowers) weight *= 1 + edgeTowerThreat(state, edge.id, towers, threatCache) * 0.9;
      if (enemyDefinition.avoidCongestion) weight *= 1 + (edgeCounts.get(edge.id) ?? 0) / 12;
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
