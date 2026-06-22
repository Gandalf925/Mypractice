import { distance, stableId } from '../core/utilities.js';
import { pointToSegmentProjection } from '../roads/geometry.js';
import { bundleText, consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { BUILD_RANGE_METERS, DEFENSE_DEFINITIONS } from './definitions.js';
import { findCombatPath } from './routing-system.js';

function nearestEdge(graph, point, maxDistance) {
  let best = null;
  for (const edge of graph.edges) {
    const a = graph.nodeById.get(edge.a);
    const b = graph.nodeById.get(edge.b);
    const projection = pointToSegmentProjection(point, a, b);
    if (projection.distance > maxDistance) continue;
    if (!best || projection.distance < best.distance) best = { edge, projection, distance: projection.distance };
  }
  return best;
}

function nearestNode(graph, point, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const node of graph.nodes) {
    const gap = distance(point, node);
    if (gap < bestDistance) {
      best = node;
      bestDistance = gap;
    }
  }
  return best;
}

export class BuildSystem {
  constructor(events) {
    this.events = events;
  }

  canAfford(state, type) {
    return Object.keys(missingBundle(state, DEFENSE_DEFINITIONS[type].cost)).length === 0;
  }

  buildAt(state, type, worldPoint, selectionToleranceMeters) {
    const definition = DEFENSE_DEFINITIONS[type];
    if (!definition) return { ok: false, reason: '不明な設備です。' };
    if (!this.canAfford(state, type)) return { ok: false, reason: `資源が不足しています：${bundleText(missingBundle(state, definition.cost))}` };
    const buildOrigin = state.world.homeBase
      ? { x: state.world.homeBase.x, y: state.world.homeBase.y }
      : state.player.worldPosition ?? { x: 0, y: 0 };
    const graph = state.world.roadGraph;

    if (definition.kind === 'barrier') {
      const nearest = nearestEdge(graph, worldPoint, selectionToleranceMeters);
      if (!nearest) return { ok: false, reason: '道路をタップしてください。' };
      if (distance(buildOrigin, nearest.projection.point) > BUILD_RANGE_METERS) return { ok: false, reason: '拠点から85m以内へ設置してください。' };
      if (state.combat.defenses.some(defense => defense.kind === 'barrier' && defense.edgeId === nearest.edge.id && defense.hp > 0 && !defense.ruined)) {
        return { ok: false, reason: 'この道路にはすでに防壁があります。' };
      }
      if (!consumeBundle(state, definition.cost)) return { ok: false, reason: '建設直前に資源が不足しました。' };
      const defense = {
        id: stableId('barrier', nearest.edge.id, state.runtime?.worldTimeMs ?? Date.now()),
        kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0, defenseKey: 'barrier0',
        edgeId: nearest.edge.id, hp: definition.hp, maxHp: definition.hp, ruined: false, isGate: false
      };
      state.combat.defenses.push(defense);
      for (const enemy of state.combat.enemies) enemy.reroutePending = true;
      const previews = state.world.enemyBases.filter(base => base.alive).map(base =>
        findCombatPath(state, base.nodeId, state.world.city.nodeId, 'infantry')
      );
      this.events?.emit('combat:defense-built', { defense });
      return { ok: true, defense, previews };
    }

    const node = nearestNode(graph, worldPoint, selectionToleranceMeters);
    if (!node) return { ok: false, reason: '交差点をタップしてください。' };
    if (distance(buildOrigin, node) > BUILD_RANGE_METERS) return { ok: false, reason: '拠点から85m以内へ設置してください。' };
    if (state.combat.defenses.some(defense => defense.kind === 'tower' && defense.nodeId === node.id && defense.hp > 0 && !defense.ruined)) {
      return { ok: false, reason: 'この交差点にはすでに設備があります。' };
    }
    if (!consumeBundle(state, definition.cost)) return { ok: false, reason: '建設直前に資源が不足しました。' };
    const defense = {
      id: stableId('tower', type, node.id, state.runtime?.worldTimeMs ?? Date.now()),
      kind: 'tower', type, line: definition.line, tier: 0, defenseKey: `${definition.line}0`,
      nodeId: node.id, hp: definition.hp, maxHp: definition.hp,
      cooldown: 0, disabledTimer: 0, ruined: false
    };
    state.combat.defenses.push(defense);
    this.events?.emit('combat:defense-built', { defense });
    return { ok: true, defense };
  }
}
