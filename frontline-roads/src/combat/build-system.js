import { distance, stableId } from '../core/utilities.js';
import { pointToSegmentProjection } from '../roads/geometry.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';
import { bundleText, consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { BUILD_RANGE_METERS, DEFENSE_DEFINITIONS } from './definitions.js';
import { findCombatPath } from './routing-system.js';
import { activePlayerBases } from '../base/player-bases.js';

const CANDIDATE_POINT_TOLERANCE_METERS = 1;
const ANCHOR_DUPLICATE_TOLERANCE_METERS = 0.5;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function buildAnchors(state) {
  const anchors = activePlayerBases(state)
    .filter(finitePoint)
    .map((base, index) => ({
      id: index === 0 ? 'base' : `base:${base.id}`,
      label: base.name || (index === 0 ? '本拠地' : `前線拠点 ${index + 1}`),
      point: { x: base.x, y: base.y },
      baseId: base.id
    }));
  if (finitePoint(state.player.worldPosition)) {
    const point = { x: state.player.worldPosition.x, y: state.player.worldPosition.y };
    const overlapsBase = anchors.some(anchor => distance(anchor.point, point) <= ANCHOR_DUPLICATE_TOLERANCE_METERS);
    if (!overlapsBase) anchors.push({ id: 'player', label: '現在地', point });
  }
  return anchors;
}

function nearestAnchor(anchors, point) {
  let best = null;
  for (const anchor of anchors) {
    const gap = distance(anchor.point, point);
    if (!best || gap < best.distance) best = { ...anchor, distance: gap };
  }
  return best;
}

function activeDefense(defense) {
  return defense.hp > 0 && !defense.ruined;
}

function nearbyEdges(graph, point, maxDistance) {
  const matches = [];
  for (const edge of graphElementsNearPoint(graph, point, maxDistance).edges) {
    const a = graph.nodeById.get(edge.a);
    const b = graph.nodeById.get(edge.b);
    if (!a || !b) continue;
    const projection = pointToSegmentProjection(point, a, b);
    if (projection.distance <= maxDistance) matches.push({ edge, projection, distance: projection.distance });
  }
  return matches.sort((left, right) => left.distance - right.distance);
}

function nearbyNodes(graph, point, maxDistance) {
  return graphElementsNearPoint(graph, point, maxDistance).nodes
    .map(node => ({ node, distance: distance(point, node) }))
    .filter(match => match.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance);
}

function towerCandidate(type, node, anchor = null) {
  return {
    type,
    kind: 'tower',
    nodeId: node.id,
    point: { x: node.x, y: node.y },
    anchorId: anchor?.id ?? null,
    anchorLabel: anchor?.label ?? null
  };
}

function barrierCandidate(type, edge, point, anchor = null) {
  return {
    type,
    kind: 'barrier',
    edgeId: edge.id,
    point: { x: point.x, y: point.y },
    anchorId: anchor?.id ?? null,
    anchorLabel: anchor?.label ?? null
  };
}

function resourceFailure(state, definition) {
  const missing = missingBundle(state, definition.cost);
  return Object.keys(missing).length
    ? { ok: false, reason: `資源が不足しています：${bundleText(missing)}`, missing }
    : null;
}

function activeAnchorIdsForSegment(anchors, a, b) {
  return anchors
    .filter(anchor => pointToSegmentProjection(anchor.point, a, b).distance <= BUILD_RANGE_METERS)
    .map(anchor => anchor.id);
}

export class BuildSystem {
  constructor(events) {
    this.events = events;
  }

  getBuildAnchors(state) {
    return buildAnchors(state);
  }

  canAfford(state, type) {
    const definition = DEFENSE_DEFINITIONS[type];
    return Boolean(definition) && !resourceFailure(state, definition);
  }

  listBuildSites(state, type) {
    const definition = DEFENSE_DEFINITIONS[type];
    const graph = state.world.roadGraph;
    if (!definition || !graph?.nodeById) return [];

    const anchors = buildAnchors(state);
    if (!anchors.length) return [];
    if (definition.kind === 'barrier') {
      const occupied = new Set(
        state.combat.defenses
          .filter(defense => defense.kind === 'barrier' && activeDefense(defense))
          .map(defense => defense.edgeId)
      );
      const candidateEdges = new Set();
      for (const anchor of anchors) {
        for (const edge of graphElementsNearPoint(graph, anchor.point, BUILD_RANGE_METERS).edges) candidateEdges.add(edge);
      }
      const sites = [];
      for (const edge of candidateEdges) {
        if (occupied.has(edge.id)) continue;
        const a = graph.nodeById.get(edge.a);
        const b = graph.nodeById.get(edge.b);
        if (!a || !b) continue;
        const anchorIds = activeAnchorIdsForSegment(anchors, a, b);
        if (!anchorIds.length) continue;
        sites.push({
          type,
          kind: 'barrier',
          edgeId: edge.id,
          point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          a: { x: a.x, y: a.y },
          b: { x: b.x, y: b.y },
          anchorIds
        });
      }
      return sites;
    }

    const occupied = new Set(
      state.combat.defenses
        .filter(defense => defense.kind === 'tower' && activeDefense(defense))
        .map(defense => defense.nodeId)
    );
    const candidateNodes = new Set();
    for (const anchor of anchors) {
      for (const node of graphElementsNearPoint(graph, anchor.point, BUILD_RANGE_METERS).nodes) candidateNodes.add(node);
    }
    return [...candidateNodes]
      .filter(node => !occupied.has(node.id))
      .map(node => ({ node, anchor: nearestAnchor(anchors, node) }))
      .filter(entry => entry.anchor?.distance <= BUILD_RANGE_METERS)
      .map(entry => towerCandidate(type, entry.node, entry.anchor));
  }

  previewAt(state, type, worldPoint, selectionToleranceMeters) {
    const definition = DEFENSE_DEFINITIONS[type];
    if (!definition) return { ok: false, reason: '不明な設備です。' };
    const graph = state.world.roadGraph;
    if (!graph?.nodeById) return { ok: false, reason: '道路データを利用できません。' };

    const candidates = definition.kind === 'barrier'
      ? nearbyEdges(graph, worldPoint, selectionToleranceMeters)
        .map(match => barrierCandidate(type, match.edge, match.projection.point))
      : nearbyNodes(graph, worldPoint, selectionToleranceMeters)
        .map(match => towerCandidate(type, match.node));
    if (!candidates.length) {
      return { ok: false, reason: definition.kind === 'barrier' ? '道路をタップしてください。' : '交差点をタップしてください。' };
    }

    let nearestFailure = null;
    for (const candidate of candidates) {
      const validation = this.validateCandidate(state, candidate, { checkResources: false });
      if (validation.ok) return { ...validation, affordable: this.canAfford(state, type) };
      nearestFailure ??= validation;
    }
    return nearestFailure;
  }

  validateCandidate(state, candidate, { checkResources = true } = {}) {
    if (!candidate || typeof candidate !== 'object') return { ok: false, reason: '設置候補がありません。' };
    const definition = DEFENSE_DEFINITIONS[candidate.type];
    if (!definition) return { ok: false, reason: '不明な設備です。' };
    if (candidate.kind !== definition.kind) return { ok: false, reason: '設置候補の種類が一致しません。' };

    const graph = state.world.roadGraph;
    if (!graph?.nodeById) return { ok: false, reason: '道路データを利用できません。' };
    const anchors = buildAnchors(state);
    if (!anchors.length) return { ok: false, reason: '建設基準となる拠点または現在地を取得できません。' };
    let normalized;

    if (definition.kind === 'barrier') {
      const edge = graph.edgeById?.get(candidate.edgeId) ?? graph.edges.find(item => item.id === candidate.edgeId);
      if (!edge) return { ok: false, reason: '対象道路が見つかりません。' };
      const a = graph.nodeById.get(edge.a);
      const b = graph.nodeById.get(edge.b);
      if (!a || !b) return { ok: false, reason: '対象道路の形状が壊れています。' };
      const requestedPoint = finitePoint(candidate.point) ? candidate.point : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const projection = pointToSegmentProjection(requestedPoint, a, b);
      if (projection.distance > CANDIDATE_POINT_TOLERANCE_METERS) return { ok: false, reason: '設置候補が道路上にありません。' };
      const anchor = nearestAnchor(anchors, projection.point);
      if (!anchor || anchor.distance > BUILD_RANGE_METERS) return { ok: false, reason: `拠点または現在地から${BUILD_RANGE_METERS}m以内へ設置してください。` };
      if (state.combat.defenses.some(defense => defense.kind === 'barrier' && defense.edgeId === edge.id && activeDefense(defense))) {
        return { ok: false, reason: 'この道路にはすでに防壁があります。' };
      }
      normalized = barrierCandidate(candidate.type, edge, projection.point, anchor);
    } else {
      const node = graph.nodeById.get(candidate.nodeId);
      if (!node) return { ok: false, reason: '対象交差点が見つかりません。' };
      const anchor = nearestAnchor(anchors, node);
      if (!anchor || anchor.distance > BUILD_RANGE_METERS) return { ok: false, reason: `拠点または現在地から${BUILD_RANGE_METERS}m以内へ設置してください。` };
      if (state.combat.defenses.some(defense => defense.kind === 'tower' && defense.nodeId === node.id && activeDefense(defense))) {
        return { ok: false, reason: 'この交差点にはすでに設備があります。' };
      }
      normalized = towerCandidate(candidate.type, node, anchor);
    }

    if (checkResources) {
      const failure = resourceFailure(state, definition);
      if (failure) return failure;
    }
    return { ok: true, candidate: normalized };
  }

  buildCandidate(state, candidate) {
    const validation = this.validateCandidate(state, candidate, { checkResources: true });
    if (!validation.ok) return validation;

    const normalized = validation.candidate;
    const definition = DEFENSE_DEFINITIONS[normalized.type];
    if (!consumeBundle(state, definition.cost)) return { ok: false, reason: '建設直前に資源が不足しました。' };

    if (definition.kind === 'barrier') {
      const defense = {
        id: stableId('barrier', normalized.edgeId, state.runtime?.worldTimeMs ?? Date.now(), state.combat.defenses.length),
        kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0, defenseKey: 'barrier0',
        edgeId: normalized.edgeId, hp: definition.hp, maxHp: definition.hp, ruined: false, isGate: false
      };
      state.combat.defenses.push(defense);
      for (const enemy of state.combat.enemies) enemy.reroutePending = true;
      const previews = state.world.enemyBases.filter(base => base.alive).map(base =>
        findCombatPath(state, base.nodeId, state.world.city.nodeId, 'infantry')
      );
      this.events?.emit('combat:defense-built', { defense });
      return { ok: true, defense, candidate: normalized, previews };
    }

    const defense = {
      id: stableId('tower', normalized.type, normalized.nodeId, state.runtime?.worldTimeMs ?? Date.now(), state.combat.defenses.length),
      kind: 'tower', type: normalized.type, line: definition.line, tier: 0, defenseKey: `${definition.line}0`,
      nodeId: normalized.nodeId, hp: definition.hp, maxHp: definition.hp,
      cooldown: 0, disabledTimer: 0, ruined: false
    };
    state.combat.defenses.push(defense);
    for (const enemy of state.combat.enemies) enemy.reroutePending = true;
    this.events?.emit('combat:defense-built', { defense });
    return { ok: true, defense, candidate: normalized };
  }
}
