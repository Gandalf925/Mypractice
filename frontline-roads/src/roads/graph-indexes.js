export function attachGraphIndexes(graph) {
  graph.nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  graph.edgeById = new Map(graph.edges.map(edge => [edge.id, edge]));
  graph.adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    graph.adjacency.get(edge.a)?.push({ to: edge.b, edgeId: edge.id, length: edge.length });
    graph.adjacency.get(edge.b)?.push({ to: edge.a, edgeId: edge.id, length: edge.length });
  }
  return graph;
}
