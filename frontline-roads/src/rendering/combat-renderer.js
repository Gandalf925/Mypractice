import { clamp } from '../core/utilities.js';
import { DEFENSE_DEFINITIONS, ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS } from '../combat/definitions.js';
import { edgeMidpoint } from '../combat/combat-geometry.js';
import { enemyPosition } from '../combat/enemy-system.js';

function circle(context, point, radius, fill, stroke = '#10151d', lineWidth = 2) {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawHealthBar(context, point, value, maximum, width = 24) {
  const ratio = clamp(value / Math.max(1, maximum), 0, 1);
  context.fillStyle = 'rgba(0,0,0,.58)';
  context.fillRect(point.x - width / 2, point.y + 11, width, 3);
  context.fillStyle = ratio < 0.3 ? '#ff6b6b' : '#7ee787';
  context.fillRect(point.x - width / 2, point.y + 11, width * ratio, 3);
}

export function drawCombatState(context, state, camera) {
  if (!state?.world?.city || !state.world.roadGraph?.nodeById) return;
  const graph = state.world.roadGraph;

  for (const base of state.world.enemyBases ?? []) {
    if (!base.alive) continue;
    const node = graph.nodeById.get(base.nodeId);
    if (!node) continue;
    const point = camera.worldToScreen(node);
    const definition = ENEMY_BASE_DEFINITIONS[base.type];
    circle(context, point, 11, '#d95858', '#ffffff66', 2.5);
    context.fillStyle = '#fff';
    context.font = 'bold 12px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(definition?.icon ?? '⚑', point.x, point.y);
  }

  for (const outpost of state.world.outposts ?? []) {
    if (!['ACTIVE', 'RUINED'].includes(outpost.status)) continue;
    const node = graph.nodeById.get(outpost.nodeId);
    if (!node) continue;
    const point = camera.worldToScreen(node);
    const active = outpost.status === 'ACTIVE';
    circle(context, point, 10, active ? '#7ee787' : '#59616d', active ? '#d8ffe0' : '#242a32', 2.5);
    context.fillStyle = active ? '#102015' : '#d5d9df';
    context.font = 'bold 10px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(active ? '前' : '廃', point.x, point.y);
    if (active) drawHealthBar(context, point, outpost.hp, outpost.maxHp, 22);
  }

  for (const defense of state.combat.defenses ?? []) {
    if (defense.hp <= 0 || defense.ruined) continue;
    if (defense.kind === 'barrier') {
      const middle = edgeMidpoint(graph, defense.edgeId);
      if (!middle) continue;
      const point = camera.worldToScreen(middle);
      const edge = graph.edgeById.get(defense.edgeId);
      const a = graph.nodeById.get(edge.a);
      const b = graph.nodeById.get(edge.b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(angle);
      context.fillStyle = '#d4a24d';
      context.strokeStyle = '#492f10';
      context.lineWidth = 2;
      context.fillRect(-10, -5, 20, 10);
      context.strokeRect(-10, -5, 20, 10);
      context.restore();
      drawHealthBar(context, point, defense.hp, defense.maxHp, 22);
      continue;
    }
    const node = graph.nodeById.get(defense.nodeId);
    if (!node) continue;
    const point = camera.worldToScreen(node);
    const fill = defense.type === 'gun' ? '#78b7ff' : defense.type === 'mortar' ? '#ffb86b' : defense.type === 'relay' ? '#7ee787' : '#c08cff';
    circle(context, point, 8, fill);
    context.fillStyle = '#111720';
    context.font = 'bold 9px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(DEFENSE_DEFINITIONS[defense.type]?.icon ?? '•', point.x, point.y);
    drawHealthBar(context, point, defense.hp, defense.maxHp, 20);
  }

  const edgeCounts = new Map();
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.edgeId) edgeCounts.set(enemy.edgeId, (edgeCounts.get(enemy.edgeId) ?? 0) + 1);
  }
  context.save();
  context.lineCap = 'round';
  for (const [edgeId, count] of edgeCounts) {
    const edge = graph.edgeById.get(edgeId);
    if (!edge) continue;
    const a = camera.worldToScreen(graph.nodeById.get(edge.a));
    const b = camera.worldToScreen(graph.nodeById.get(edge.b));
    context.strokeStyle = `rgba(255,80,80,${Math.min(0.5, 0.12 + count * 0.025)})`;
    context.lineWidth = Math.min(24, 5 + count * 1.3);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  context.restore();

  const edgeEnemyIndices = new Map();
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
    const position = enemyPosition(state, enemy);
    let renderPosition = position;
    if (enemy.edgeId) {
      const edge = graph.edgeById.get(enemy.edgeId);
      const a = edge && graph.nodeById.get(edge.a);
      const b = edge && graph.nodeById.get(edge.b);
      if (a && b) {
        const index = edgeEnemyIndices.get(enemy.edgeId) ?? 0;
        edgeEnemyIndices.set(enemy.edgeId, index + 1);
        const lane = ((index % 5) - 2) * 2.4;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        renderPosition = {
          x: position.x - (b.y - a.y) / length * lane,
          y: position.y + (b.x - a.x) / length * lane
        };
      }
    }
    const point = camera.worldToScreen(renderPosition);
    const definition = ENEMY_DEFINITIONS[enemy.type];
    circle(context, point, definition.radius, enemy.slowTimer > 0 ? '#c08cff' : '#ff6b6b', '#5a1717', 1.5);
    if (enemy.hp < enemy.maxHp) drawHealthBar(context, point, enemy.hp, enemy.maxHp, 16);
  }

  const cityNode = graph.nodeById.get(state.world.city.nodeId);
  if (cityNode) {
    const point = camera.worldToScreen(cityNode);
    circle(context, point, 13, '#f4f7fb', '#78b7ff', 3);
    context.fillStyle = '#11141a';
    context.font = 'bold 14px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('城', point.x, point.y + 1);
    drawHealthBar(context, point, state.world.city.hp, state.world.city.maxHp, 30);
  }

  const player = state.player.worldPosition;
  if (player) {
    const point = camera.worldToScreen(player);
    circle(context, point, 7, '#7ee787', '#0b3f20', 2.5);
  }
}
