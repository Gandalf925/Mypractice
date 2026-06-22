export function shortestPath(graph, startId, targetId, { blockedEdgeIds = new Set(), maxDistance = Infinity } = {}) {
  if (startId === targetId) return { distance: 0, nodeIds: [startId], edgeIds: [] };
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const queue = [{ id: startId, distance: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    if (current.distance > maxDistance) break;
    if (current.id === targetId) break;
    visited.add(current.id);
    for (const connection of graph.adjacency.get(current.id) ?? []) {
      if (blockedEdgeIds.has(connection.edgeId)) continue;
      const nextDistance = current.distance + connection.length;
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
  return { distance: distances.get(targetId), nodeIds, edgeIds };
}
