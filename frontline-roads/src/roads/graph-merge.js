import { distance, stableId } from '../core/utilities.js';
import { attachGraphIndexes } from './road-graph.js';
import { segmentAngle, segmentMidpoint } from './geometry.js';

function bucketKey(point, size) {
  return `${Math.floor(point.x / size)},${Math.floor(point.y / size)}`;
}

function candidateBuckets(point, size) {
  const x = Math.floor(point.x / size);
  const y = Math.floor(point.y / size);
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) result.push(`${x + dx},${y + dy}`);
  }
  return result;
}

function createNodeIndex(nodes, size) {
  const buckets = new Map();
  for (const node of nodes) {
    const key = bucketKey(node, size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  }
  return buckets;
}

function nearestCompatibleNode(node, buckets, threshold) {
  let best = null;
  let bestDistance = threshold;
  for (const key of candidateBuckets(node, threshold)) {
    for (const candidate of buckets.get(key) ?? []) {
      const gap = distance(node, candidate);
      if (gap <= bestDistance) {
        best = candidate;
        bestDistance = gap;
      }
    }
  }
  return best;
}

function uniqueNodeId(node, used) {
  let id = stableId('node', Math.round(node.x * 10), Math.round(node.y * 10));
  let sequence = 1;
  while (used.has(id)) id = `${stableId('node', Math.round(node.x * 100), Math.round(node.y * 100))}_${sequence++}`;
  used.add(id);
  return id;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function mergeEdgeMetadata(target, source) {
  target.roadWidth = Math.max(Number(target.roadWidth) || 0, Number(source.roadWidth) || 0);
  target.lanes = Math.max(Number(target.lanes) || 1, Number(source.lanes) || 1);
  if (!target.name && source.name) target.name = source.name;
  if (!target.highway && source.highway) target.highway = source.highway;
  target.oneway = Boolean(target.oneway && source.oneway);
  target.chunkIds = [...new Set([...(target.chunkIds ?? []), ...(source.chunkIds ?? [])])];
  target.mergedSegmentIds = [...new Set([...(target.mergedSegmentIds ?? []), ...(source.mergedSegmentIds ?? [source.id])])];
}

export function mergeRoadGraphs(baseGraph, incomingGraph, { nodeMergeDistanceMeters = 10, chunkId = null } = {}) {
  if (!baseGraph?.nodes || !baseGraph?.edges) throw new TypeError('baseGraph is required');
  if (!incomingGraph?.nodes || !incomingGraph?.edges) return { graph: attachGraphIndexes(baseGraph), addedNodes: 0, addedEdges: 0, mergedEdges: 0 };

  const usedNodeIds = new Set(baseGraph.nodes.map(node => node.id));
  const buckets = createNodeIndex(baseGraph.nodes, nodeMergeDistanceMeters);
  const nodeMap = new Map();
  let addedNodes = 0;

  for (const sourceNode of incomingGraph.nodes) {
    const existing = nearestCompatibleNode(sourceNode, buckets, nodeMergeDistanceMeters);
    if (existing) {
      nodeMap.set(sourceNode.id, existing.id);
      existing.chunkIds = [...new Set([...(existing.chunkIds ?? []), ...(sourceNode.chunkIds ?? []), ...(chunkId ? [chunkId] : [])])];
      continue;
    }
    const node = {
      ...sourceNode,
      id: usedNodeIds.has(sourceNode.id) ? uniqueNodeId(sourceNode, usedNodeIds) : sourceNode.id,
      chunkIds: [...new Set([...(sourceNode.chunkIds ?? []), ...(chunkId ? [chunkId] : [])])]
    };
    usedNodeIds.add(node.id);
    baseGraph.nodes.push(node);
    const key = bucketKey(node, nodeMergeDistanceMeters);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
    nodeMap.set(sourceNode.id, node.id);
    addedNodes += 1;
  }

  const nodeById = new Map(baseGraph.nodes.map(node => [node.id, node]));
  const edgeByPair = new Map(baseGraph.edges.map(edge => [pairKey(edge.a, edge.b), edge]));
  const usedEdgeIds = new Set(baseGraph.edges.map(edge => edge.id));
  let addedEdges = 0;
  let mergedEdges = 0;

  for (const sourceEdge of incomingGraph.edges) {
    const a = nodeMap.get(sourceEdge.a);
    const b = nodeMap.get(sourceEdge.b);
    if (!a || !b || a === b) continue;
    const pair = pairKey(a, b);
    const existing = edgeByPair.get(pair);
    const edgeChunkIds = [...new Set([...(sourceEdge.chunkIds ?? []), ...(chunkId ? [chunkId] : [])])];
    if (existing) {
      mergeEdgeMetadata(existing, { ...sourceEdge, chunkIds: edgeChunkIds });
      mergedEdges += 1;
      continue;
    }
    const nodeA = nodeById.get(a);
    const nodeB = nodeById.get(b);
    if (!nodeA || !nodeB) continue;
    let id = stableId('edge', pair, sourceEdge.name ?? '', sourceEdge.highway ?? '');
    let sequence = 1;
    while (usedEdgeIds.has(id)) id = `${stableId('edge', pair, sourceEdge.id)}_${sequence++}`;
    usedEdgeIds.add(id);
    const edge = {
      ...sourceEdge,
      id,
      a,
      b,
      length: distance(nodeA, nodeB),
      points: [{ x: nodeA.x, y: nodeA.y }, { x: nodeB.x, y: nodeB.y }],
      mid: segmentMidpoint({ a: nodeA, b: nodeB }),
      angle: segmentAngle({ a: nodeA, b: nodeB }),
      chunkIds: edgeChunkIds,
      mergedSegmentIds: [...(sourceEdge.mergedSegmentIds ?? [sourceEdge.id])]
    };
    baseGraph.edges.push(edge);
    edgeByPair.set(pair, edge);
    addedEdges += 1;
  }

  baseGraph.roadSpecVersion = Math.max(Number(baseGraph.roadSpecVersion) || 1, 2);
  attachGraphIndexes(baseGraph);
  return { graph: baseGraph, addedNodes, addedEdges, mergedEdges };
}
