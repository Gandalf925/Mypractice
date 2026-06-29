import { distance, stableId } from '../core/utilities.js';
import { ROAD_CONFIG } from '../core/constants.js';
import { pointToSegmentProjection } from '../roads/geometry.js';
import { graphElementsNearPoint } from '../roads/road-graph.js';
import { bundleText, consumeBundle, missingBundle } from '../civilization/inventory-system.js';
import { BUILD_RANGE_METERS, DEFENSE_DEFINITIONS, defenseRuntimeDefinition } from './definitions.js';
import {
  EXPEDITION_BUILD_RANGE_METERS,
  PLAYER_BUILD_RANGE_METERS,
  fieldBaseBuildRange,
  majorBaseBuildRange
} from '../base/construction-range.js';
import { detachDefense } from './defense-lifecycle.js';
import { activePlayerBases, playerBasesView } from '../base/player-bases.js';
import { activeFieldBases } from '../base/field-bases.js';
import { roadUnitPosition } from './road-unit-position.js';
import {
  barrierSiteForAnchor,
  buildSitePlanner,
  nearestBarrierSections,
  nearestTacticalSites,
  supportSitesForAnchor
} from './build-site-planner.js';

const ANCHOR_DUPLICATE_TOLERANCE_METERS = 0.5;
const TOWER_OCCUPANCY_RADIUS_METERS = 24;
const BARRIER_MINIMUM_SPACING_METERS = 45;
const PARALLEL_OVERLAP_TOLERANCE_METERS = 3;
const PARALLEL_ANGLE_TOLERANCE_RADIANS = 15 * Math.PI / 180;
const SUPPORT_TYPES = new Set(['relay', 'medical', 'survey', 'fieldBarracks']);

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function buildAnchors(state) {
  const civilizationLevel = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  const majorRange = majorBaseBuildRange(civilizationLevel);
  const fieldRange = fieldBaseBuildRange(civilizationLevel);
  const activeMajorBases = activePlayerBases(state).filter(finitePoint);
  const anchors = activeMajorBases
    .map((base, index) => ({
      id: index === 0 ? 'base' : `base:${base.id}`,
      label: base.name || (index === 0 ? 'Home Base' : `Major Base ${index + 1}`),
      point: { x: base.x, y: base.y },
      range: majorRange,
      civilizationLevel,
      kind: 'MAJOR',
      baseId: base.id
    }));
  if (!activeMajorBases.some(base => base.primary) && (state.combat?.playerCheckmate?.active || Number(state.world?.city?.hp) <= 0)) {
    const recoveryBase = playerBasesView(state).find(base => base.primary && finitePoint(base));
    if (recoveryBase) anchors.unshift({
      id: 'base:recovery',
      label: recoveryBase.name || 'Home Base Ruins',
      point: { x: recoveryBase.x, y: recoveryBase.y },
      range: majorRange,
      civilizationLevel,
      kind: 'MAJOR',
      baseId: recoveryBase.id,
      recovery: true
    });
  }
  for (const base of activeFieldBases(state).filter(finitePoint)) {
    anchors.push({
      id: `field:${base.id}`,
      label: base.name || 'Simple Base',
      point: { x: base.x, y: base.y },
      range: fieldRange,
      civilizationLevel,
      kind: 'FIELD',
      baseId: base.id
    });
  }
  for (const squad of state.combat?.friendlySquads ?? []) {
    if (squad.type !== 'expedition' || squad.hp <= 0 || ['RECOVERING', 'READY'].includes(squad.status)) continue;
    const point = roadUnitPosition(state, squad);
    if (!finitePoint(point)) continue;
    anchors.push({
      id: `expedition:${squad.id}`,
      label: 'Expedition Squad',
      point: { x: point.x, y: point.y },
      range: EXPEDITION_BUILD_RANGE_METERS,
      civilizationLevel,
      kind: 'EXPEDITION',
      baseId: squad.originBaseId ?? null,
      squadId: squad.id
    });
  }
  if (finitePoint(state.player.worldPosition)) {
    const point = { x: state.player.worldPosition.x, y: state.player.worldPosition.y };
    const overlapsBase = anchors.some(anchor => distance(anchor.point, point) <= ANCHOR_DUPLICATE_TOLERANCE_METERS);
    if (!overlapsBase) anchors.push({
      id: 'player', label: 'current position ', point, range: PLAYER_BUILD_RANGE_METERS,
      civilizationLevel,
      kind: 'PLAYER'
    });
  }
  return anchors;
}

function coveringAnchor(anchors, point) {
  let best = null;
  for (const anchor of anchors) {
    const gap = distance(anchor.point, point);
    const range = Math.max(0, Number(anchor.range) || BUILD_RANGE_METERS);
    if (gap > range) continue;
    if (!best || gap < best.distance) best = { ...anchor, distance: gap };
  }
  return best;
}

function towerCandidate(type, node, anchor = null, tacticalReason = null) {
  return {
    type,
    kind: 'tower',
    nodeId: node.id,
    point: { x: node.x, y: node.y },
    tacticalReason,
    anchorId: anchor?.id ?? null,
    anchorLabel: anchor?.label ?? null,
    anchorKind: anchor?.kind ?? null,
    baseId: anchor?.baseId ?? null
  };
}

function barrierCandidate(type, edge, point, anchor = null, section = null) {
  return {
    type,
    kind: 'barrier',
    edgeId: edge.id,
    point: { x: point.x, y: point.y },
    edgeProgress: Number(section?.edgeProgress) || Math.max(0, Number(edge.length) || 0) / 2,
    barrierSectionId: section?.id ?? null,
    barrierSectionEdgeIds: section?.edgeIds ? [...section.edgeIds] : [edge.id],
    anchorId: anchor?.id ?? null,
    anchorLabel: anchor?.label ?? null,
    anchorKind: anchor?.kind ?? null,
    baseId: anchor?.baseId ?? null
  };
}

function resourceFailure(state, definition) {
  const missing = missingBundle(state, definition.cost);
  return Object.keys(missing).length
    ? { ok: false, reason: `resources Missing: ${bundleText(missing)}`, missing }
    : null;
}

function civilizationFailure(state, definition) {
  const required = Math.max(0, Number(definition.requiredCivilizationLevel) || 0);
  return (state.civilization?.level ?? 0) < required
    ? { ok: false, reason: `Civ Lv.${required} required.`, requiredCivilizationLevel: required }
    : null;
}

function allowedAnchorsForDefinition(anchors, definition) {
  const allowed = Array.isArray(definition.allowedAnchorKinds) ? new Set(definition.allowedAnchorKinds) : null;
  return allowed ? anchors.filter(anchor => allowed.has(anchor.kind)) : anchors;
}

function anchorHasFacility(state, definition, anchor) {
  if (!definition.limitPerAnchor) return false;
  return state.combat.defenses.some(defense => defense.type === definition.type && defense.buildAnchorId === anchor.id);
}

function buildRangeReason(state, definition) {
  const level = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  const labels = {
    MAJOR: `Major Base${majorBaseBuildRange(level)}m`,
    FIELD: `Simple Base${fieldBaseBuildRange(level)}m`,
    PLAYER: `current position ${PLAYER_BUILD_RANGE_METERS}m`,
    EXPEDITION: `Expedition Squad${EXPEDITION_BUILD_RANGE_METERS}m`
  };
  const kinds = Array.isArray(definition.allowedAnchorKinds)
    ? definition.allowedAnchorKinds
    : ['MAJOR', 'FIELD', 'PLAYER', 'EXPEDITION'];
  return `Buildavailablein range to Placeplease (${kinds.map(kind => labels[kind]).filter(Boolean).join(', ')}).`;
}

function edgeGeometry(graph, edgeId) {
  const edge = graph.edgeById.get(edgeId);
  const a = edge && graph.nodeById.get(edge.a);
  const b = edge && graph.nodeById.get(edge.b);
  return edge && a && b ? { edge, a, b } : null;
}

function barrierPoint(graph, defense) {
  if (finitePoint(defense.placementPoint)) return defense.placementPoint;
  const geometry = edgeGeometry(graph, defense.edgeId);
  return geometry ? { x: (geometry.a.x + geometry.b.x) / 2, y: (geometry.a.y + geometry.b.y) / 2 } : null;
}

function segmentAngle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDifference(left, right) {
  let value = Math.abs(left - right) % Math.PI;
  if (value > Math.PI / 2) value = Math.PI - value;
  return value;
}

function projectedInterval(segmentA, segmentB, axisA, axisB) {
  const dx = axisB.x - axisA.x;
  const dy = axisB.y - axisA.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-9) return null;
  const project = point => ((point.x - axisA.x) * dx + (point.y - axisA.y) * dy) / lengthSq;
  const values = [project(segmentA), project(segmentB)].sort((a, b) => a - b);
  return values;
}

function physicallyOverlappingEdges(graph, leftEdgeId, rightEdgeId) {
  const left = edgeGeometry(graph, leftEdgeId);
  const right = edgeGeometry(graph, rightEdgeId);
  if (!left || !right) return false;
  if (angleDifference(segmentAngle(left.a, left.b), segmentAngle(right.a, right.b)) > PARALLEL_ANGLE_TOLERANCE_RADIANS) return false;
  const leftToRight = Math.max(
    pointToSegmentProjection(left.a, right.a, right.b).distance,
    pointToSegmentProjection(left.b, right.a, right.b).distance
  );
  const rightToLeft = Math.max(
    pointToSegmentProjection(right.a, left.a, left.b).distance,
    pointToSegmentProjection(right.b, left.a, left.b).distance
  );
  if (Math.min(leftToRight, rightToLeft) > PARALLEL_OVERLAP_TOLERANCE_METERS) return false;
  const interval = projectedInterval(right.a, right.b, left.a, left.b);
  if (!interval) return false;
  return Math.min(1, interval[1]) - Math.max(0, interval[0]) > 0.2;
}

function barrierConflict(state, candidate) {
  const graph = state.world.roadGraph;
  const candidateEdges = new Set(candidate.barrierSectionEdgeIds ?? [candidate.edgeId]);
  for (const squad of state.combat?.friendlySquads ?? []) {
    if (squad.hp > 0 && squad.edgeId && candidateEdges.has(squad.edgeId)) return squad;
  }
  for (const defense of state.combat.defenses) {
    if (defense.kind !== 'barrier') continue;
    if (candidate.barrierSectionId && defense.barrierSectionId === candidate.barrierSectionId) return defense;
    if (candidateEdges.has(defense.edgeId)) return defense;
    const point = barrierPoint(graph, defense);
    if (point && distance(point, candidate.point) < BARRIER_MINIMUM_SPACING_METERS) return defense;
    if (physicallyOverlappingEdges(graph, candidate.edgeId, defense.edgeId)) return defense;
  }
  return null;
}

function towerOccupied(state, point) {
  const graph = state.world.roadGraph;
  return state.combat.defenses.some(defense => {
    if (defense.kind !== 'tower') return false;
    const node = graph.nodeById.get(defense.nodeId);
    return node && distance(node, point) < TOWER_OCCUPANCY_RADIUS_METERS;
  });
}

function nearestGraphNode(graph, anchor) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of graphElementsNearPoint(graph, anchor.point, anchor.range).nodes) {
    const gap = distance(anchor.point, node);
    if (gap <= anchor.range && gap < bestDistance) { best = node; bestDistance = gap; }
  }
  return best;
}

function markBarrierRoutesDirty(state) {
  for (const enemy of state.combat?.enemies ?? []) enemy.reroutePending = true;
  for (const squad of state.combat?.friendlySquads ?? []) squad.reroutePending = true;
}

export class BuildSystem {
  constructor(events) {
    this.events = events;
  }

  getBuildAnchors(state) {
    return buildAnchors(state);
  }

  getBuildStatus(state, type) {
    const definition = DEFENSE_DEFINITIONS[type];
    if (!definition) return { ok: false, reason: 'Unknown facility.' };
    return civilizationFailure(state, definition) ?? resourceFailure(state, definition) ?? { ok: true, definition };
  }

  canAfford(state, type) {
    return this.getBuildStatus(state, type).ok;
  }

  listBuildSites(state, type) {
    const definition = DEFENSE_DEFINITIONS[type];
    const graph = state.world.roadGraph;
    if (!definition || !graph?.nodeById) return [];
    let anchors = allowedAnchorsForDefinition(buildAnchors(state), definition);
    anchors = anchors.filter(anchor => !anchorHasFacility(state, definition, anchor));
    if (!anchors.length || civilizationFailure(state, definition)) return [];
    const planner = buildSitePlanner(graph);

    if (definition.kind === 'barrier') {
      const sites = [];
      for (const section of planner.barrierSections) {
        const placements = anchors
          .map(anchor => ({ anchor, placement: barrierSiteForAnchor(graph, section, anchor) }))
          .filter(item => item.placement)
          .sort((left, right) => left.placement.distance - right.placement.distance);
        if (!placements.length) continue;
        const { anchor, placement } = placements[0];
        const edge = graph.edgeById.get(placement.edgeId);
        if (!edge) continue;
        const candidate = barrierCandidate(type, edge, placement.point, anchor, { ...section, ...placement });
        if (barrierConflict(state, candidate)) continue;
        sites.push({
          ...candidate,
          a: { x: graph.nodeById.get(edge.a)?.x ?? placement.point.x, y: graph.nodeById.get(edge.a)?.y ?? placement.point.y },
          b: { x: graph.nodeById.get(edge.b)?.x ?? placement.point.x, y: graph.nodeById.get(edge.b)?.y ?? placement.point.y },
          anchorIds: placements.map(item => item.anchor.id)
        });
      }
      return sites;
    }

    const chosen = new Map();
    const addSite = (site, anchor) => {
      const node = graph.nodeById.get(site.nodeId);
      if (!node || towerOccupied(state, node)) return;
      const existing = chosen.get(node.id);
      if (!existing || distance(anchor.point, node) < distance(existing.anchor.point, node)) chosen.set(node.id, { site, anchor, node });
    };

    if (SUPPORT_TYPES.has(type)) {
      for (const anchor of anchors) {
        const limit = type === 'fieldBarracks' ? 1 : 6;
        for (const site of supportSitesForAnchor(planner, anchor, limit)) addSite(site, anchor);
        if (![...chosen.values()].some(entry => entry.anchor.id === anchor.id)) {
          const node = nearestGraphNode(graph, anchor);
          if (node) addSite({ nodeId: node.id, reason: 'anchor' }, anchor);
        }
      }
    } else {
      for (const site of planner.tacticalSites) {
        const anchor = coveringAnchor(anchors, site.point);
        if (anchor) addSite(site, anchor);
      }
      for (const anchor of anchors) {
        const node = nearestGraphNode(graph, anchor);
        if (node) addSite({ nodeId: node.id, reason: 'anchor' }, anchor);
      }
    }

    return [...chosen.values()].map(({ site, anchor, node }) => towerCandidate(type, node, anchor, site.reason));
  }

  previewAt(state, type, worldPoint, selectionToleranceMeters) {
    const definition = DEFENSE_DEFINITIONS[type];
    if (!definition) return { ok: false, reason: 'Unknown facility.' };
    const graph = state.world.roadGraph;
    if (!graph?.nodeById) return { ok: false, reason: 'Road data is unavailable.' };
    const tolerance = Math.max(0, Number(selectionToleranceMeters) || 0);
    const legalSites = this.listBuildSites(state, type);
    const legalMatches = legalSites.map(site => ({ site, distance: distance(worldPoint, site.point) }));
    const selected = legalMatches
      .filter(match => match.distance <= tolerance)
      .sort((left, right) => left.distance - right.distance)[0]?.site;
    if (selected) return { ok: true, candidate: selected, affordable: this.canAfford(state, type) };

    // No legal site matched. Inspect the underlying road geometry so the caller gets
    // a useful range/occupancy reason instead of a generic miss.
    const planner = buildSitePlanner(graph);
    const rawCandidates = definition.kind === 'barrier'
      ? nearestBarrierSections(graph, planner, worldPoint, tolerance).map(match => {
          const edge = match.edge;
          const section = match.section;
          return barrierCandidate(type, edge, match.projection.point, null, {
            ...section,
            edgeId: edge.id,
            edgeProgress: Math.max(0, Number(edge.length) || 0) * match.projection.t
          });
        })
      : nearestTacticalSites(planner, worldPoint, tolerance).map(site => {
          const node = graph.nodeById.get(site.nodeId);
          return node ? towerCandidate(type, node, null, site.reason) : null;
        }).filter(Boolean);
    const allowedAnchors = allowedAnchorsForDefinition(buildAnchors(state), definition);
    if (rawCandidates.length && !coveringAnchor(allowedAnchors, worldPoint)) {
      return { ok: false, reason: buildRangeReason(state, definition) };
    }
    let nearestFailure = null;
    for (const candidate of rawCandidates) {
      const validation = this.validateCandidate(state, candidate, { checkResources: false });
      if (!validation.ok) nearestFailure ??= validation;
    }
    return nearestFailure ?? {
      ok: false,
      reason: definition.kind === 'barrier' ? 'Tap a build point on a road segment.' : 'Tap a highlighted tactical point.'
    };
  }

  validateCandidate(state, candidate, { checkResources = true } = {}) {
    if (!candidate || typeof candidate !== 'object') return { ok: false, reason: 'Placement candidate is unavailable.' };
    const definition = DEFENSE_DEFINITIONS[candidate.type];
    if (!definition) return { ok: false, reason: 'Unknown facility.' };
    if (candidate.kind !== definition.kind) return { ok: false, reason: 'Placement candidate type does not match.' };
    const graph = state.world.roadGraph;
    if (!graph?.nodeById) return { ok: false, reason: 'Road data is unavailable.' };
    const locked = civilizationFailure(state, definition);
    if (locked) return locked;
    const anchors = allowedAnchorsForDefinition(buildAnchors(state), definition);
    if (!anchors.length) return { ok: false, reason: 'No valid build anchor was found near the base, current position, or expedition squad.' };

    const legalSites = this.listBuildSites(state, candidate.type);
    const normalized = definition.kind === 'barrier'
      ? legalSites.find(site =>
          (candidate.barrierSectionId && site.barrierSectionId === candidate.barrierSectionId)
          || site.edgeId === candidate.edgeId
          || site.barrierSectionEdgeIds?.includes(candidate.edgeId)
        )
      : legalSites.find(site => site.nodeId === candidate.nodeId);
    if (!normalized) {
      const inRange = coveringAnchor(anchors, candidate.point ?? graph.nodeById.get(candidate.nodeId));
      if (!inRange) return { ok: false, reason: buildRangeReason(state, definition) };
      return { ok: false, reason: definition.kind === 'barrier'
        ? 'This road segment already has a facility or cannot be used as a build point.'
        : 'This point already has a facility, or no build point is available.' };
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
    if (!consumeBundle(state, definition.cost)) return { ok: false, reason: 'Not enough resources to build.' };

    if (definition.kind === 'barrier') {
      const defense = {
        id: stableId('barrier', normalized.barrierSectionId ?? normalized.edgeId, state.runtime?.worldTimeMs ?? Date.now(), state.combat.defenses.length),
        kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0, defenseKey: 'barrier0',
        edgeId: normalized.edgeId,
        edgeProgress: normalized.edgeProgress,
        placementPoint: { ...normalized.point },
        barrierSectionId: normalized.barrierSectionId,
        barrierSectionEdgeIds: [...(normalized.barrierSectionEdgeIds ?? [normalized.edgeId])],
        hp: definition.hp, maxHp: definition.hp, isGate: false,
        buildAnchorId: normalized.anchorId, buildAnchorKind: normalized.anchorKind, baseId: normalized.baseId
      };
      state.combat.defenses.push(defense);
      state.civilization.progress.barriersBuilt = (state.civilization.progress.barriersBuilt ?? 0) + 1;
      markBarrierRoutesDirty(state);
      this.events?.emit('combat:defense-built', { defense });
      return { ok: true, defense, candidate: normalized };
    }

    const defense = {
      id: stableId('tower', normalized.type, normalized.nodeId, state.runtime?.worldTimeMs ?? Date.now(), state.combat.defenses.length),
      kind: 'tower', type: normalized.type, line: definition.line, tier: definition.initialTier ?? 0, defenseKey: definition.defenseKey ?? `${definition.line}${definition.initialTier ?? 0}`,
      nodeId: normalized.nodeId, hp: definition.hp, maxHp: definition.hp,
      buildAnchorId: normalized.anchorId, buildAnchorKind: normalized.anchorKind, baseId: normalized.baseId,
      cooldown: 0, disabledTimer: 0
    };
    if (normalized.type === 'survey') {
      defense.surveyNextAt = (state.runtime?.worldTimeMs ?? Date.now()) + ROAD_CONFIG.surveyInitialDelayMs;
      defense.surveyStatus = 'WAITING';
      defense.surveyLastChunkId = null;
      defense.surveyCompletedCount = 0;
      defense.surveyErrorCount = 0;
      defense.surveyRetryAt = 0;
      defense.surveyLastError = null;
      defense.surveyLastSuccessAt = 0;
      defense.surveyLastConnectionAt = 0;
      defense.surveyLastResponseElements = 0;
      defense.surveyLastErrorStage = null;
      defense.surveyLastEndpoint = null;
      defense.surveyLastTransport = null;
      defense.surveyLastRoadCount = 0;
    }
    state.combat.defenses.push(defense);
    this.events?.emit('combat:defense-built', { defense });
    return { ok: true, defense, candidate: normalized };
  }

  removeDefense(state, defenseId) {
    const defenses = state.combat?.defenses ?? [];
    const index = defenses.findIndex(defense => defense.id === defenseId);
    if (index < 0) return { ok: false, reason: 'Facility to remove was not found.' };
    const defense = detachDefense(state, defenses[index].id);
    if (!defense) return { ok: false, reason: 'Facility to remove was not found.' };
    if (defense.kind === 'barrier') markBarrierRoutesDirty(state);
    const name = defenseRuntimeDefinition(defense).name ?? DEFENSE_DEFINITIONS[defense.type]?.name ?? 'facility';
    this.events?.emit('combat:defense-removed', { defenseId: defense.id, defense });
    return { ok: true, defense, message: `${name} dismantled. Resources were not refunded.` };
  }
}
