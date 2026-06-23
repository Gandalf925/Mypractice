import { distance } from '../core/utilities.js';
import { enemyPosition } from './enemy-system.js';
import { combineRoadPaths, findRoadPathWeighted } from './routing-system.js';
import { friendlySquadPosition, FRIENDLY_SQUAD_DEFINITIONS } from './friendly-force-system.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';

export const FRIENDLY_ORDER_MODE = Object.freeze({
  RETREAT: 'RETREAT',
  RESUME: 'RESUME',
  WITHDRAW: 'WITHDRAW'
});

const ROUTE_LABELS = Object.freeze({
  shortest: '最短',
  safe: '敵回避',
  support: '味方援護'
});

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function edgePoint(state, edge) {
  const a = state.world.roadGraph.nodeById.get(edge.a);
  const b = state.world.roadGraph.nodeById.get(edge.b);
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

function visibleEnemyPressure(state, edge) {
  const point = edgePoint(state, edge);
  if (!point) return 0;
  let pressure = 0;
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
    const gap = distance(point, enemyPosition(state, enemy));
    if (gap > 90) continue;
    pressure += (1 - gap / 90) * Math.max(1, Number(enemy.level) || 1);
  }
  return pressure;
}

function friendlySupport(state, edge) {
  const point = edgePoint(state, edge);
  if (!point) return 0;
  let support = 0;
  for (const base of state.world.playerBases ?? []) {
    if (base.status !== 'ESTABLISHED' || base.hp <= 0) continue;
    const node = state.world.roadGraph.nodeById.get(base.nodeId) ?? base;
    if (distance(point, node) <= 110) support += 1.25;
  }
  for (const defense of state.combat.defenses ?? []) {
    if (defense.kind !== 'tower' || defense.hp <= 0 || defense.ruined) continue;
    const node = state.world.roadGraph.nodeById.get(defense.nodeId);
    if (node && distance(point, node) <= Math.max(50, Number(defense.range) || 80)) support += 0.6;
  }
  return support;
}

function pathWithStrategy(state, startId, targetId, strategy, penalizedEdges = null) {
  return findRoadPathWeighted(state, startId, targetId, edge => {
    let weight = edge.length;
    if (strategy === 'safe') weight *= 1 + visibleEnemyPressure(state, edge) * 2.25;
    if (strategy === 'support') {
      const support = friendlySupport(state, edge);
      const pressure = visibleEnemyPressure(state, edge);
      weight *= Math.max(0.58, 1.18 - Math.min(0.6, support * 0.14) + pressure * 0.45);
    }
    if (penalizedEdges?.has(edge.id)) weight *= 8;
    return weight;
  });
}

function routeThrough(state, startId, waypointNodeIds, destinationNodeId, strategy, penalizedEdges = null) {
  const targets = [...waypointNodeIds, destinationNodeId];
  const paths = [];
  let cursor = startId;
  for (const targetId of targets) {
    const segment = pathWithStrategy(state, cursor, targetId, strategy, penalizedEdges);
    if (!segment) return null;
    paths.push(segment);
    cursor = targetId;
  }
  return combineRoadPaths(paths);
}

function pathMetrics(state, path, speed) {
  let physicalDistance = 0;
  let enemyContacts = 0;
  let supportScore = 0;
  const counted = new Set();
  for (const edgeId of path.edgeIds) {
    const edge = state.world.roadGraph.edgeById.get(edgeId);
    if (!edge) continue;
    physicalDistance += edge.length;
    supportScore += friendlySupport(state, edge);
    const a = state.world.roadGraph.nodeById.get(edge.a);
    const b = state.world.roadGraph.nodeById.get(edge.b);
    if (!a || !b) continue;
    for (const enemy of state.combat.enemies ?? []) {
      if (enemy.hp <= 0 || enemy.departDelay > 0 || counted.has(enemy.id)) continue;
      if (pointToSegmentDistance(enemyPosition(state, enemy), a, b) <= 32) {
        counted.add(enemy.id);
        enemyContacts += Math.max(1, Number(enemy.level) || 1);
      }
    }
  }
  const risk = enemyContacts <= 1 ? '低' : enemyContacts <= 4 ? '中' : '高';
  return {
    physicalDistance,
    etaSeconds: physicalDistance / Math.max(0.1, speed),
    enemyContacts,
    supportScore,
    risk
  };
}

export function commandStartNodeId(state, squad) {
  if (squad.edgeId && (squad.edgeProgress ?? 0) > 0 && squad.path?.nodeIds?.[squad.pathIndex + 1]) return squad.path.nodeIds[squad.pathIndex + 1];
  return squad.nodeId;
}

export function nearestRoadNode(state, point, tolerance = Infinity) {
  const graph = state.world.roadGraph;
  const nearby = graph ? graphElementsNearPoint(graph, point, tolerance).nodes : [];
  let best = null;
  let bestDistance = Infinity;
  for (const node of nearby) {
    const gap = distance(point, node);
    if (gap < bestDistance) { best = node; bestDistance = gap; }
  }
  return best && bestDistance <= tolerance ? { node: best, distance: bestDistance } : null;
}

export function orderDestinationNodeId(state, squad, mode) {
  if (mode === FRIENDLY_ORDER_MODE.RESUME) {
    if (squad.heldOrder === 'RETREAT' && squad.heldDestinationNodeId) return squad.heldDestinationNodeId;
    const targetId = squad.missionTargetBaseId ?? squad.targetBaseId;
    return state.world.enemyBases.find(base => base.id === targetId && base.alive && base.hp > 0)?.nodeId ?? null;
  }
  if (mode === FRIENDLY_ORDER_MODE.WITHDRAW) {
    return state.world.playerBases?.find(base => base.id === squad.originBaseId && base.status === 'ESTABLISHED' && base.hp > 0)?.nodeId ?? null;
  }
  return null;
}

export function validateRetreatDestination(state, squad, nodeId) {
  const node = state.world.roadGraph.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: '道路上の地点を選択してください。' };
  const startId = commandStartNodeId(state, squad);
  if (nodeId === startId) return { ok: false, reason: '現在の進路先とは別の地点を選択してください。' };
  const missionId = squad.missionTargetBaseId ?? squad.targetBaseId;
  const target = state.world.enemyBases.find(base => base.id === missionId && base.alive && base.hp > 0);
  if (target) {
    const targetNode = state.world.roadGraph.nodeById.get(target.nodeId);
    const start = state.world.roadGraph.nodeById.get(startId) ?? friendlySquadPosition(state, squad);
    const isOwnedBase = (state.world.playerBases ?? []).some(base => base.nodeId === nodeId && base.status === 'ESTABLISHED' && base.hp > 0);
    if (!isOwnedBase && targetNode && distance(node, targetNode) + 5 < distance(start, targetNode)) {
      return { ok: false, reason: '後退地点は現在より敵基地から遠い道路上を選択してください。' };
    }
  }
  return { ok: true, node };
}

export function buildFriendlyRouteOptions(state, squad, destinationNodeId, waypointNodeIds = []) {
  const startId = commandStartNodeId(state, squad);
  if (!startId || !destinationNodeId) return [];
  const definition = FRIENDLY_SQUAD_DEFINITIONS[squad.type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
  const options = [];
  const signatures = new Set();
  const addOption = (id, label, path) => {
    if (!path) return false;
    const signature = path.edgeIds.join('|');
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    options.push({ id, label, path, ...pathMetrics(state, path, definition.speed) });
    return true;
  };
  for (const strategy of ['shortest', 'safe', 'support']) {
    addOption(strategy, ROUTE_LABELS[strategy], routeThrough(state, startId, waypointNodeIds, destinationNodeId, strategy));
  }
  let detourIndex = 1;
  for (const basis of [...options]) {
    if (options.length >= 3) break;
    const penalized = new Set(basis.path.edgeIds);
    const path = routeThrough(state, startId, waypointNodeIds, destinationNodeId, 'shortest', penalized);
    if (addOption(`detour-${detourIndex}`, `別経路${detourIndex}`, path)) detourIndex += 1;
  }
  return options.slice(0, 3);
}

