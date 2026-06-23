import { distance } from '../core/utilities.js';
import { defenseRuntimeDefinition } from '../combat/definitions.js';
import { chunksIntersectingCircle, neighboringChunks } from '../roads/world-chunk-grid.js';
import { activePlayerBases } from '../base/player-bases.js';
import { activeFieldBases } from '../base/field-bases.js';

export const SURVEY_FACILITY_TYPE = 'survey';
export const SURVEY_INITIAL_TIER = 1;

function hasOperationalAnchor(state, defense) {
  if (defense.buildAnchorKind === 'FIELD') {
    return activeFieldBases(state).some(base => base.id === defense.baseId);
  }
  if (defense.buildAnchorKind === 'MAJOR') {
    return activePlayerBases(state).some(base => base.id === defense.baseId);
  }
  return true;
}

export function activeSurveyFacilities(state) {
  return (state?.combat?.defenses ?? [])
    .filter(defense => defense.type === SURVEY_FACILITY_TYPE && defense.kind === 'tower' && defense.hp > 0 && !defense.ruined)
    .filter(defense => hasOperationalAnchor(state, defense))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function synchronizeSurveyFacility(defense, worldTimeMs = Date.now()) {
  if (!defense || defense.type !== SURVEY_FACILITY_TYPE) return defense;
  const definition = defenseRuntimeDefinition(defense);
  const initialDelaySeconds = Math.max(10, Math.min(60, Number(definition?.scanInterval) || 180) / 6);
  defense.surveyNextAt = Number(defense.surveyNextAt) || worldTimeMs + initialDelaySeconds * 1000;
  defense.surveyLastChunkId ??= null;
  defense.surveyStatus ??= 'WAITING';
  defense.surveyCompletedCount = Math.max(0, Math.floor(Number(defense.surveyCompletedCount) || 0));
  return defense;
}

function hasLoadedNeighbor(chunk, loaded) {
  return neighboringChunks(chunk, 1)
    .some(candidate => candidate.id !== chunk.id && loaded.has(candidate.id));
}

export function surveyChunkCandidates(state, defense, { pendingIds = new Set(), now = Date.now(), retryCooldownMs = 0 } = {}) {
  const graph = state?.world?.roadGraph;
  const chunks = state?.world?.roadChunks;
  const node = graph?.nodeById?.get(defense?.nodeId);
  const definition = defenseRuntimeDefinition(defense);
  const radius = Math.max(0, Number(definition?.surveyRadius) || 0);
  if (!node || !chunks || radius <= 0) return [];

  const loaded = new Set([...(chunks.loaded ?? []), ...(chunks.empty ?? [])]);
  return chunksIntersectingCircle(node, radius, chunks.sizeMeters)
    .filter(chunk => !loaded.has(chunk.id) && !pendingIds.has(chunk.id))
    .filter(chunk => {
      const failure = chunks.failed?.[chunk.id];
      if (!failure) return true;
      const failedAt = Number(failure.at);
      return !Number.isFinite(failedAt) || now - failedAt >= retryCooldownMs;
    })
    .filter(chunk => hasLoadedNeighbor(chunk, loaded))
    .map(chunk => ({
      ...chunk,
      distance: distance(node, chunk.center)
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function surveyFacilityPresentation(state, defense, pendingIds = new Set()) {
  if (!defense || defense.type !== SURVEY_FACILITY_TYPE) return null;
  const definition = defenseRuntimeDefinition(defense);
  const now = Number(state?.runtime?.worldTimeMs) || Date.now();
  const candidates = surveyChunkCandidates(state, defense, { pendingIds, now, retryCooldownMs: 0 });
  return {
    radius: Number(definition?.surveyRadius) || 0,
    intervalSeconds: Number(definition?.scanInterval) || 0,
    nextScanSeconds: Math.max(0, Math.ceil(((Number(defense.surveyNextAt) || now) - now) / 1000)),
    remainingChunks: candidates.length,
    completedCount: Math.max(0, Number(defense.surveyCompletedCount) || 0),
    status: defense.surveyStatus ?? 'WAITING'
  };
}
