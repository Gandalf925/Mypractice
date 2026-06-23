import { ROAD_CONFIG } from '../core/constants.js';
import { stableId } from '../core/utilities.js';
import { attachGraphIndexes } from './road-graph.js';
import { mergeRoadGraphs } from './graph-merge.js';
import {
  chunkCenterLocation,
  chunkForWorldPoint,
  chunksNearWorldPoint,
  ensureRoadChunkState
} from './world-chunk-grid.js';
import { activeSurveyFacilities, surveyChunkCandidates, synchronizeSurveyFacility } from '../exploration/survey-system.js';
import { defenseRuntimeDefinition } from '../combat/definitions.js';

function compactChunkGraph(graph) {
  return {
    nodes: graph.nodes.map(({ lat, lon, ...node }) => ({ ...node })),
    edges: graph.edges.map(({ points, mid, angle, ...edge }) => ({ ...edge })),
    center: graph.center,
    source: graph.source,
    roadSpecVersion: graph.roadSpecVersion,
    chunkId: graph.chunkId
  };
}

export function roadWorldId(graph) {
  const lat = Number(graph?.center?.lat ?? 0).toFixed(4);
  const lon = Number(graph?.center?.lon ?? 0).toFixed(4);
  return stableId('road_world', lat, lon);
}

export class RoadWorldManager {
  constructor({ roadService, cache, store, renderer = null, onGraphChanged = null, onStatus = null, now = () => Date.now() }) {
    this.roadService = roadService;
    this.cache = cache;
    this.store = store;
    this.renderer = renderer;
    this.onGraphChanged = onGraphChanged;
    this.onStatus = onStatus;
    this.now = now;
    this.queue = [];
    this.pending = new Set();
    this.running = false;
    this.abortController = null;
    this.lastSurveyEnqueueAt = 0;
  }

  ensureState() {
    let result = null;
    this.store.mutate(state => { result = ensureRoadChunkState(state.world); }, 'roads:chunk-state');
    return result;
  }

  async restoreCachedChunks() {
    this.ensureState();
    const state = this.store.select(value => value);
    const graph = state.world.roadGraph;
    if (!graph || !this.cache?.isAvailable?.()) return { restored: 0 };
    const chunks = state.world.roadChunks;
    const worldId = roadWorldId(graph);
    let restored = 0;
    for (const id of chunks.cached ?? []) {
      if (chunks.integrated?.includes(id)) continue;
      const payload = await this.cache.get(worldId, id).catch(() => null);
      if (!payload) continue;
      attachGraphIndexes(payload);
      this.store.mutate(draft => {
        mergeRoadGraphs(draft.world.roadGraph, payload, { chunkId: id });
        const chunkState = ensureRoadChunkState(draft.world);
        if (!chunkState.integrated.includes(id)) chunkState.integrated.push(id);
      }, 'roads:cache-restored');
      restored += 1;
    }
    if (restored > 0) this.graphChanged({ reason: 'cache', restored });
    return { restored };
  }

  considerLocation(location) {
    this.ensureState();
    const state = this.store.select(value => value);
    const graph = state.world.roadGraph;
    if (!graph || !location) return [];
    const chunks = state.world.roadChunks;
    const worldPoint = state.player.worldPosition;
    if (!worldPoint) return [];

    const observedChunkId = chunkForWorldPoint(worldPoint, chunks.sizeMeters).id;
    let observationChanged = false;
    this.store.mutate(draft => {
      const chunkState = ensureRoadChunkState(draft.world);
      if ((chunkState.loaded.includes(observedChunkId) || chunkState.empty.includes(observedChunkId)) && !chunkState.playerObserved.includes(observedChunkId)) {
        chunkState.playerObserved.push(observedChunkId);
        observationChanged = true;
      }
    }, 'roads:player-observed');
    if (observationChanged) this.graphChanged({ reason: 'player-observed', chunkId: observedChunkId });

    const candidates = chunksNearWorldPoint(worldPoint, chunks.sizeMeters)
      .filter(chunk => !chunks.loaded.includes(chunk.id) && !chunks.empty.includes(chunk.id) && !this.pending.has(chunk.id))
      .filter(chunk => {
        const failure = chunks.failed?.[chunk.id];
        if (!failure) return true;
        const failedAt = Number(failure.at);
        return !Number.isFinite(failedAt) || this.now() - failedAt >= ROAD_CONFIG.chunkRetryCooldownMs;
      });
    for (const chunk of candidates) this.enqueue(chunk, graph.center, { mode: 'movement' });
    return candidates.map(chunk => chunk.id);
  }

  considerSurveyFacilities() {
    this.ensureState();
    const realNow = this.now();
    if (realNow - this.lastSurveyEnqueueAt < 30000) return [];
    let plan = null;
    this.store.mutate(state => {
      const worldTimeMs = Number(state.runtime?.worldTimeMs) || realNow;
      const facilities = activeSurveyFacilities(state);
      for (const defense of facilities) {
        synchronizeSurveyFacility(defense, worldTimeMs);
        if (defense.disabledTimer > 0 || worldTimeMs < defense.surveyNextAt) continue;
        const candidates = surveyChunkCandidates(state, defense, {
          pendingIds: this.pending,
          now: realNow,
          retryCooldownMs: ROAD_CONFIG.chunkRetryCooldownMs
        });
        const definition = defenseRuntimeDefinition(defense);
        const intervalSeconds = Math.max(30, Number(definition?.scanInterval) || 180);
        defense.surveyNextAt = worldTimeMs + intervalSeconds * 1000;
        if (!candidates.length) {
          defense.surveyStatus = 'COMPLETE';
          continue;
        }
        const chunk = candidates[0];
        defense.surveyStatus = 'QUEUED';
        defense.surveyLastChunkId = chunk.id;
        plan = { chunk, worldCenter: state.world.roadGraph.center, defenseId: defense.id };
        break;
      }
    }, 'survey:schedule');
    if (!plan) return [];
    this.lastSurveyEnqueueAt = realNow;
    this.enqueue(plan.chunk, plan.worldCenter, { mode: 'survey', defenseId: plan.defenseId });
    return [plan.chunk.id];
  }

  enqueue(chunk, worldCenter, options = {}) {
    if (this.pending.has(chunk.id)) return;
    this.pending.add(chunk.id);
    this.queue.push({ chunk, worldCenter, options });
    this.processQueue();
  }

  async processQueue() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        try {
          await this.loadChunk(next.chunk, next.worldCenter, next.options);
        } catch (error) {
          this.onStatus?.({ type: 'error', chunkId: next.chunk.id, text: '道路区域の統合に失敗しました。' });
        } finally {
          this.pending.delete(next.chunk.id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async loadChunk(chunk, worldCenter, { mode = 'movement', defenseId = null } = {}) {
    this.ensureState();
    const state = this.store.select(value => value);
    const currentChunks = state.world.roadChunks;
    if (currentChunks.loaded.includes(chunk.id) || currentChunks.empty.includes(chunk.id)) {
      this.store.mutate(draft => {
        const chunkState = ensureRoadChunkState(draft.world);
        const observationList = mode === 'survey' ? chunkState.surveyed : chunkState.playerObserved;
        if (!observationList.includes(chunk.id)) observationList.push(chunk.id);
        if (defenseId) {
          const defense = draft.combat.defenses.find(item => item.id === defenseId);
          if (defense) defense.surveyStatus = 'WAITING';
        }
      }, 'roads:chunk-already-loaded');
      return;
    }
    const worldId = roadWorldId(state.world.roadGraph);
    this.onStatus?.({ type: 'loading', chunkId: chunk.id, text: mode === 'survey' ? '測量施設が周辺道路を解析しています…' : '周辺道路を偵察しています…' });

    let graph = await this.cache?.get?.(worldId, chunk.id).catch(() => null);
    let source = 'cache';
    if (graph) attachGraphIndexes(graph);
    if (!graph) {
      source = 'network';
      this.abortController = new AbortController();
      try {
        const chunkCenter = chunkCenterLocation(chunk, worldCenter, currentChunks.sizeMeters);
        graph = await this.roadService.loadChunk({
          worldCenter,
          chunkCenter,
          chunkId: chunk.id,
          radiusMeters: ROAD_CONFIG.chunkFetchRadiusMeters
        }, { signal: this.abortController.signal });
        await this.cache?.put?.(worldId, chunk.id, compactChunkGraph(graph)).catch(() => false);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        this.store.mutate(draft => {
          const chunkState = ensureRoadChunkState(draft.world);
          chunkState.failed[chunk.id] = { at: this.now(), message: String(error?.message ?? error).slice(0, 160) };
          chunkState.updatedAt = this.now();
          if (defenseId) {
            const defense = draft.combat.defenses.find(item => item.id === defenseId);
            if (defense) defense.surveyStatus = 'ERROR';
          }
        }, 'roads:chunk-failed');
        this.onStatus?.({ type: 'error', chunkId: chunk.id, text: mode === 'survey' ? '測量施設による道路取得に失敗しました。時間を置いて再試行します。' : '周辺道路を取得できませんでした。移動後に再試行します。' });
        return;
      } finally {
        this.abortController = null;
      }
    }

    let mergeResult = { addedNodes: 0, addedEdges: 0, mergedEdges: 0 };
    this.store.mutate(draft => {
      const chunkState = ensureRoadChunkState(draft.world);
      delete chunkState.failed[chunk.id];
      if (graph.nodes.length === 0 || graph.edges.length === 0) {
        if (!chunkState.empty.includes(chunk.id)) chunkState.empty.push(chunk.id);
      } else {
        mergeResult = mergeRoadGraphs(draft.world.roadGraph, graph, { chunkId: chunk.id });
        if (!chunkState.loaded.includes(chunk.id)) chunkState.loaded.push(chunk.id);
        if (!chunkState.cached.includes(chunk.id)) chunkState.cached.push(chunk.id);
        if (!chunkState.integrated.includes(chunk.id)) chunkState.integrated.push(chunk.id);
      }
      const observationList = mode === 'survey' ? chunkState.surveyed : chunkState.playerObserved;
      if (!observationList.includes(chunk.id)) observationList.push(chunk.id);
      if (defenseId) {
        const defense = draft.combat.defenses.find(item => item.id === defenseId);
        if (defense) {
          defense.surveyStatus = 'WAITING';
          defense.surveyCompletedCount = Math.max(0, Number(defense.surveyCompletedCount) || 0) + 1;
          defense.surveyLastChunkId = chunk.id;
        }
      }
      chunkState.updatedAt = this.now();
    }, 'roads:chunk-merged', { validate: true });

    this.graphChanged({ reason: source, chunkId: chunk.id, ...mergeResult });
    this.onStatus?.({
      type: 'loaded',
      chunkId: chunk.id,
      text: graph.edges.length > 0
        ? `${mode === 'survey' ? '測量施設が新しい道路区域を追加しました' : '新しい道路区域を確認しました'}（道路 ${mergeResult.addedEdges}）`
        : mode === 'survey' ? '測量区域に利用可能な道路はありませんでした。' : 'この区域には利用可能な道路がありません。'
    });
  }

  graphChanged(detail) {
    const graph = this.store.select(state => state.world.roadGraph);
    this.renderer?.setGraph(graph);
    this.renderer?.invalidateStatic?.();
    this.renderer?.render?.();
    this.onGraphChanged?.(detail);
  }

  abort() {
    this.queue.length = 0;
    this.pending.clear();
    this.abortController?.abort();
    this.abortController = null;
    this.lastSurveyEnqueueAt = 0;
  }

  async clearCurrentWorld() {
    const graph = this.store.select(state => state.world.roadGraph);
    if (!graph) return false;
    return this.cache?.removeWorld?.(roadWorldId(graph)).catch(() => false) ?? false;
  }

  destroy() {
    this.abort();
    this.cache?.close?.();
  }
}
