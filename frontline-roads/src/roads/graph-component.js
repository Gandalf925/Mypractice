export function keepCenterComponent(graph) {
  if (graph.nodes.length === 0) return graph;
  const links = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    links.get(edge.a)?.push(edge.b);
    links.get(edge.b)?.push(edge.a);
  }
  const centerNode = graph.nodes.reduce((best, node) => Math.hypot(node.x, node.y) < Math.hypot(best.x, best.y) ? node : best, graph.nodes[0]);
  const keep = new Set([centerNode.id]);
  const queue = [centerNode.id];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of links.get(current) ?? []) {
      if (keep.has(next)) continue;
      keep.add(next);
      queue.push(next);
    }
  }
  graph.nodes = graph.nodes.filter(node => keep.has(node.id));
  graph.edges = graph.edges.filter(edge => keep.has(edge.a) && keep.has(edge.b));
  return graph;
}
