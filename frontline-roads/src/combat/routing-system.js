import { distance } from '../core/utilities.js';
import { DEFENSE_DEFINITIONS, ENEMY_DEFINITIONS } from './definitions.js';
import { scaleEnemyDefinition } from './enemy-scaling.js';
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
    if (tower.kind !== 'tower' || ['relay', 'survey', 'medical', 'fieldAid'].includes(tower.type)) continue;
    const node = graph.nodeById.get(tower.nodeId);
    const range = tower.range ?? 80;
    if (node && distance(middle, node) <= range) threat += 1;
  }
  cache.set(edgeId, threat);
  return threat;
}

function barrierDelaySeconds(enemyDefinition, barrier, routeBias) {
  const dps = Math.max(0.1, Number(enemyDefinition.barrierDps) || 0.1);
  const breakSeconds = Math.max(0, Number(barrier.hp) || 0) / dps;
  const strategy = enemyDefinition.barrierStrategy ?? 'balanced';
  const factor = Math.max(0.05, Number(enemyDefinition.barrierCostFactor) || 1);
  const bias = Math.max(0.75, Math.min(1.25, Number(routeBias) || 1));
  if (strategy === 'avoid') return 900 + breakSeconds * factor * bias;
  if (strategy === 'breach') return breakSeconds * factor * bias;
  return breakSeconds * factor * bias;
}

function reconstructPath(previous, startId, targetId, cost, extra = {}) {
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
  return { nodeIds, edgeIds, cost, targetId, ...extra };
}

function searchCombatPath(state, startId, targetCandidates, enemyType, previewBarrierEdgeId, routeBias, enemyLevel = 1) {
  const graph = state.world.roadGraph;
  if (!graph?.nodeById?.has(startId) || !targetCandidates.length) return null;
  const enemyDefinition = scaleEnemyDefinition(ENEMY_DEFINITIONS[enemyType] ?? ENEMY_DEFINITIONS.infantry, enemyLevel);
  const { barriers, towers } = defenseMaps(state);
  const edgeCounts = enemyDefinition.avoidCongestion ? enemyCountMap(state) : null;
  const threatCache = new Map();
  const targetsByNode = new Map();
  for (const candidate of targetCandidates) {
    if (!graph.nodeById.has(candidate.nodeId)) continue;
    const entries = targetsByNode.get(candidate.nodeId) ?? [];
    entries.push(candidate);
    targetsByNode.set(candidate.nodeId, entries);
  }
  if (!targetsByNode.size) return null;

  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = new MinHeap();
  queue.push({ id: startId, distance: 0 });
  let best = null;

  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current.id)) continue;
    if (best && current.distance > best.totalCost) break;
    visited.add(current.id);

    for (const target of targetsByNode.get(current.id) ?? []) {
      const totalCost = current.distance + Math.max(0, Number(target.priorityPenalty) || 0);
      if (!best || totalCost < best.totalCost) best = { ...target, routeCost: current.distance, totalCost };
    }

    for (const connection of graph.adjacency.get(current.id) ?? []) {
      const edge = graph.edgeById.get(connection.edgeId);
      if (!edge) continue;
      let weight = edge.length / Math.max(0.1, enemyDefinition.speed ?? 1);
      const barrier = connection.edgeId === previewBarrierEdgeId
        ? { hp: DEFENSE_DEFINITIONS.barrier.hp }
        : barriers.get(connection.edgeId);
      if (barrier?.hp > 0) weight += barrierDelaySeconds(enemyDefinition, barrier, routeBias);
      if (enemyDefinition.avoidTowers) weight *= 1 + edgeTowerThreat(state, edge.id, towers, threatCache) * 0.9;
      if (enemyDefinition.avoidCongestion) weight *= 1 + (edgeCounts.get(edge.id) ?? 0) / 12;
      const nextDistance = current.distance + weight;
      if (nextDistance >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, nextDistance);
      previous.set(connection.to, { from: current.id, edgeId: connection.edgeId });
      queue.push({ id: connection.to, distance: nextDistance });
    }
  }

  if (!best) return null;
  return reconstructPath(previous, startId, best.nodeId, best.routeCost, { targetObjectId: best.targetObjectId ?? null });
}


export function findRoadPath(state, startId, targetId) {
  const graph = state.world.roadGraph;
  if (!graph?.nodeById?.has(startId) || !graph.nodeById.has(targetId)) return null;
  if (startId === targetId) return { nodeIds: [startId], edgeIds: [], cost: 0, targetId };
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = new MinHeap();
  queue.push({ id: startId, distance: 0 });
  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.id === targetId) return reconstructPath(previous, startId, targetId, current.distance);
    for (const connection of graph.adjacency.get(current.id) ?? []) {
      if (!graph.edgeById.has(connection.edgeId)) continue;
      const nextDistance = current.distance + connection.length;
      if (nextDistance >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, nextDistance);
      previous.set(connection.to, { from: current.id, edgeId: connection.edgeId });
      queue.push({ id: connection.to, distance: nextDistance });
    }
  }
  return null;
}

export function findRoadPathWeighted(state, startId, targetId, edgeWeight = null) {
  const graph = state.world.roadGraph;
  if (!graph?.nodeById?.has(startId) || !graph.nodeById.has(targetId)) return null;
  if (startId === targetId) return { nodeIds: [startId], edgeIds: [], cost: 0, targetId };
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = new MinHeap();
  queue.push({ id: startId, distance: 0 });
  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.id === targetId) return reconstructPath(previous, startId, targetId, current.distance);
    for (const connection of graph.adjacency.get(current.id) ?? []) {
      const edge = graph.edgeById.get(connection.edgeId);
      if (!edge) continue;
      const rawWeight = edgeWeight ? edgeWeight(edge, current.id, connection.to) : edge.length;
      const weight = Number.isFinite(rawWeight) ? Math.max(0.001, rawWeight) : edge.length;
      const nextDistance = current.distance + weight;
      if (nextDistance >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, nextDistance);
      previous.set(connection.to, { from: current.id, edgeId: connection.edgeId });
      queue.push({ id: connection.to, distance: nextDistance });
    }
  }
  return null;
}

export function combineRoadPaths(paths) {
  const valid = paths.filter(Boolean);
  if (!valid.length) return null;
  const nodeIds = [...valid[0].nodeIds];
  const edgeIds = [...valid[0].edgeIds];
  let cost = Number(valid[0].cost) || 0;
  for (let index = 1; index < valid.length; index += 1) {
    const path = valid[index];
    if (nodeIds[nodeIds.length - 1] !== path.nodeIds[0]) return null;
    nodeIds.push(...path.nodeIds.slice(1));
    edgeIds.push(...path.edgeIds);
    cost += Number(path.cost) || 0;
  }
  return { nodeIds, edgeIds, cost, targetId: nodeIds[nodeIds.length - 1] };
}

export function findCombatPath(state, startId, targetId, enemyType = 'infantry', previewBarrierEdgeId = null, routeBias = 1, enemyLevel = 1) {
  return searchCombatPath(state, startId, [{ nodeId: targetId }], enemyType, previewBarrierEdgeId, routeBias, enemyLevel);
}

export function findCombatPathToTargets(state, startId, targets, enemyType = 'infantry', routeBias = 1, enemyLevel = 1) {
  return searchCombatPath(state, startId, targets, enemyType, null, routeBias, enemyLevel);
}
