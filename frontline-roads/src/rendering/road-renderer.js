function drawEdge(context, a, b, width, style, shadow = null, blur = 0) {
  context.strokeStyle = style;
  context.lineWidth = width;
  context.shadowColor = shadow ?? 'transparent';
  context.shadowBlur = blur;
  context.beginPath();
  context.moveTo(a.x, a.y);
  context.lineTo(b.x, b.y);
  context.stroke();
}

export function drawRoadGraph(context, graph, camera, { selectedEdgeId = null, timeMs = 0 } = {}) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalCompositeOperation = 'screen';

  for (const edge of graph.edges) {
    const a = camera.worldToScreen(graph.nodeById.get(edge.a));
    const b = camera.worldToScreen(graph.nodeById.get(edge.b));
    const baseWidth = Math.max(1.2, Math.min(8, edge.roadWidth * camera.scale * 0.28));
    const selected = edge.id === selectedEdgeId;
    const pulse = selected ? 0.78 + Math.sin(timeMs * 0.006) * 0.18 : 0;

    drawEdge(context, a, b, baseWidth + 5, selected ? `rgba(79,255,205,${0.18 + pulse * 0.14})` : 'rgba(0,103,94,0.22)');
    drawEdge(context, a, b, baseWidth + 1.8, selected ? '#48ffd0' : 'rgba(17,174,157,0.42)', selected ? '#4affd3' : '#00bca7', selected ? 14 : 5);
    drawEdge(context, a, b, Math.max(0.8, baseWidth * 0.42), selected ? '#d4fff2' : 'rgba(113,255,222,0.68)');
  }

  if (camera.scale >= 0.7) {
    context.fillStyle = 'rgba(112,255,223,0.34)';
    context.shadowColor = '#55ffd3';
    context.shadowBlur = 4;
    for (const node of graph.nodes) {
      const point = camera.worldToScreen(node);
      if (point.x < -4 || point.y < -4 || point.x > camera.viewportWidth + 4 || point.y > camera.viewportHeight + 4) continue;
      context.beginPath();
      context.arc(point.x, point.y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
}
