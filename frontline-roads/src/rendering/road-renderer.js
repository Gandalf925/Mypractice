import { graphElementsInBounds } from '../roads/road-graph.js';

function drawEdge(context, a, b, width, style, shadow = null, blur = 0) {
  context.strokeStyle = style;
  context.lineWidth = width;
  context.shadowColor = shadow ?? 'transparent';
  context.shadowBlur = blur;
  context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
}

function lineVisible(a, b, width, height, margin = 16) {
  if (a.x < -margin && b.x < -margin) return false;
  if (a.y < -margin && b.y < -margin) return false;
  if (a.x > width + margin && b.x > width + margin) return false;
  if (a.y > height + margin && b.y > height + margin) return false;
  return true;
}

function visibleWorldBounds(camera, marginPixels = 24) {
  const margin = marginPixels / Math.max(0.001, camera.scale);
  const halfWidth = camera.viewportWidth / (2 * camera.scale);
  const halfHeight = camera.viewportHeight / (2 * camera.scale);
  return {
    minX: camera.x - halfWidth - margin,
    minY: camera.y - halfHeight - margin,
    maxX: camera.x + halfWidth + margin,
    maxY: camera.y + halfHeight + margin
  };
}

export function drawRoadGraph(context, graph, camera, { selectedEdgeId = null, timeMs = 0, preferences = {} } = {}) {
  const quality = preferences.quality ?? 'balanced';
  const visible = graphElementsInBounds(graph, visibleWorldBounds(camera));
  context.save();
  context.lineCap = 'round'; context.lineJoin = 'round'; context.globalCompositeOperation = 'screen';
  for (const edge of visible.edges) {
    const nodeA = graph.nodeById.get(edge.a);
    const nodeB = graph.nodeById.get(edge.b);
    if (!nodeA || !nodeB) continue;
    const a = camera.worldToScreen(nodeA);
    const b = camera.worldToScreen(nodeB);
    if (!lineVisible(a, b, camera.viewportWidth, camera.viewportHeight)) continue;
    const baseWidth = Math.max(1, Math.min(quality === 'minimal' ? 5 : 8, edge.roadWidth * camera.scale * 0.25));
    const selected = edge.id === selectedEdgeId;
    const pulse = selected ? 0.78 + Math.sin(timeMs * 0.006) * 0.18 : 0;
    if (quality === 'full' || selected) drawEdge(context, a, b, baseWidth + 4, selected ? `rgba(79,255,205,${0.18 + pulse * 0.14})` : 'rgba(0,103,94,0.17)');
    drawEdge(context, a, b, baseWidth + (quality === 'minimal' ? 0.5 : 1.5), selected ? '#48ffd0' : 'rgba(17,174,157,0.4)', selected ? '#4affd3' : null, selected ? 10 : 0);
    if (quality !== 'minimal') drawEdge(context, a, b, Math.max(0.7, baseWidth * 0.38), selected ? '#d4fff2' : 'rgba(113,255,222,0.62)');
  }
  if (quality === 'full' && camera.scale >= 0.85) {
    context.fillStyle = 'rgba(112,255,223,0.28)';
    for (const node of visible.nodes) {
      const point = camera.worldToScreen(node);
      if (point.x < -4 || point.y < -4 || point.x > camera.viewportWidth + 4 || point.y > camera.viewportHeight + 4) continue;
      context.beginPath(); context.arc(point.x, point.y, 1, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
}
