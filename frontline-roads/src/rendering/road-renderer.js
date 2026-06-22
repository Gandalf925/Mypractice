export function drawRoadGraph(context, graph, camera, { selectedEdgeId = null } = {}) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const edge of graph.edges) {
    const a = camera.worldToScreen(graph.nodeById.get(edge.a));
    const b = camera.worldToScreen(graph.nodeById.get(edge.b));
    const width = Math.max(2.5, Math.min(14, edge.roadWidth * camera.scale * 0.45));
    context.strokeStyle = '#252d38';
    context.lineWidth = width + 3;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();

    context.strokeStyle = edge.id === selectedEdgeId ? '#7ee787' : '#536173';
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  context.restore();
}
