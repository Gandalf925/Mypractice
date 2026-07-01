import { SAVE_KEY } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { deepClone } from '../core/utilities.js';
import { validateState } from '../core/state-schema.js';
import { roundPublicLocation } from '../location/location-privacy.js';
import { isLegacySave, migrateLegacySave } from './legacy-save-migration.js';
import { resolveStorage } from './storage-access.js';
import { decodeRoadGraph, encodeRoadGraph } from './road-graph-codec.js';

const MAX_SAVE_BYTES = 4_500_000;
const RESET_MARKER_KEY = 'frontline_roads_reset_marker_v1';
const APP_STORAGE_PREFIX = 'frontline_roads_';

function messageSource(key, text, params = {}) {
  return { key, params, text };
}

function normalizeWarning(message, fallbackKey = 'save.storageUnavailable', fallbackText = 'ブラウザの保存領域を利用できません。このタブを閉じると進行状況は失われます。') {
  if (message && typeof message === 'object' && message.key) {
    return { key: String(message.key), params: message.params ?? {}, text: message.text ?? message.fallback ?? fallbackText };
  }
  if (typeof message === 'string' && message.trim()) return { key: fallbackKey, params: {}, text: message };
  return messageSource(fallbackKey, fallbackText);
}

const SAVE_WARNING = Object.freeze({
  storageUnavailable: messageSource('save.storageUnavailable', 'ブラウザの保存領域を利用できません。このタブを閉じると進行状況は失われます。'),
  invalidSaveQuarantined: messageSource('save.invalidSaveQuarantined', '保存データを復元できなかったため、新しいゲームとして開始します。破損データは無効化しました。'),
  resetMarkerDetected: messageSource('save.resetMarkerDetected', '初期化前の保存データを検出したため、新しいゲームとして開始します。'),
  corruptSaveQuarantined: messageSource('save.corruptSaveQuarantined', '保存データが破損していたため、新しいゲームとして開始します。破損データは無効化しました。'),
  loadFailed: messageSource('save.loadFailed', '保存データを読み込めなかったため、新しいゲームとして開始します。'),
  saveFailedProgressLost: messageSource('save.saveFailedProgressLost', '保存に失敗しました。このタブを閉じると、以後の進行状況は失われます。')
});

function sanitizeGraph(graph) {
  if (!graph) return graph;
  if (Number.isFinite(Number(graph.center?.lat)) && Number.isFinite(Number(graph.center?.lon))) graph.center = roundPublicLocation(graph.center, 4);
  else delete graph.center;
  for (const node of graph.nodes ?? []) {
    delete node.lat;
    delete node.lon;
  }
  return encodeRoadGraph(graph);
}

function sanitizeState(state, { detached = false } = {}) {
  const copy = detached ? state : deepClone(state);
  const timestamp = Date.now();
  copy.runtime.lastSavedAt = timestamp;
  copy.player.currentPosition = null;
  copy.player.locationAccuracy = null;
  copy.player.locationUpdatedAt = null;
  copy.player.worldPosition = copy.world.homeBase ? { x: copy.world.homeBase.x, y: copy.world.homeBase.y } : null;
  copy.world.recoveryCollection = null;
  if (copy.world.homeBase) delete copy.world.homeBase.location;
  for (const base of copy.world.playerBases ?? []) delete base.location;
  for (const base of copy.world.fieldBases ?? []) delete base.location;
  copy.world.roadGraph = sanitizeGraph(copy.world.roadGraph);
  return { copy, timestamp };
}

function restoreEncodedGraph(state) {
  if (state?.world?.roadGraph) state.world.roadGraph = decodeRoadGraph(state.world.roadGraph);
  return state;
}

function storageKeys(storage) {
  if (!storage) return [];
  const keys = [];
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key != null) keys.push(String(key));
    }
    return keys;
  }
  if (storage.values instanceof Map) return [...storage.values.keys()].map(String);
  return [];
}

function resetMarkerTime(storage) {
  if (!storage) return 0;
  const value = Number(storage.getItem?.(RESET_MARKER_KEY));
  return Number.isFinite(value) ? value : 0;
}

function statePredatesReset(state, markerAt) {
  if (!markerAt) return false;
  const createdAt = Number(state?.runtime?.createdAt) || 0;
  return createdAt > 0 && createdAt <= markerAt;
}

export class SaveRepository {
  constructor(storage = undefined, key = SAVE_KEY, legacyKeys = ['frontline_roads_refactor_v1', 'frontline_roads_pages_mvp_v31']) {
    this.storage = resolveStorage(storage);
    this.key = key;
    this.legacyKeys = legacyKeys;
    this.backupKey = `${key}_legacy_backup`;
    this.corruptBackupKey = `${key}_corrupt_backup`;
    this.warning = this.storage ? null : SAVE_WARNING.storageUnavailable;
  }

  isAvailable() {
    return Boolean(this.storage);
  }

  consumeWarning() {
    const warning = this.warning;
    this.warning = null;
    return warning;
  }

  markUnavailable(message = SAVE_WARNING.storageUnavailable) {
    this.storage = null;
    this.warning = normalizeWarning(message);
  }

  discardInvalid(raw = null) {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.key);
      this.storage.removeItem(this.corruptBackupKey);
      if (raw) {
        try {
          const parsed = restoreEncodedGraph(JSON.parse(raw));
          if (parsed?.world?.roadGraph) {
            const { copy } = sanitizeState(parsed);
            this.storage.setItem(this.corruptBackupKey, JSON.stringify(copy));
          }
        } catch {
          // Unparseable data is not retained because it may contain private location text.
        }
      }
    } catch {
      this.markUnavailable();
    }
  }

  quarantineCurrent(message = messageSource('save.invalidSaveRecovered', '保存データを復元できなかったため、新しいゲームとして開始します。')) {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(this.key);
      this.discardInvalid(raw);
      this.warning = normalizeWarning(message, 'save.invalidSaveRecovered', '保存データを復元できなかったため、新しいゲームとして開始します。');
      return true;
    } catch {
      this.markUnavailable();
      return false;
    }
  }

  load() {
    if (!this.storage) return null;
    try {
      let raw = this.storage.getItem(this.key);
      let sourceKey = this.key;
      if (!raw) {
        for (const legacyKey of this.legacyKeys) {
          raw = this.storage.getItem(legacyKey);
          if (raw) { sourceKey = legacyKey; break; }
        }
      }
      if (!raw) return null;
      let state = restoreEncodedGraph(JSON.parse(raw));
      if (isLegacySave(state)) {
        state = migrateLegacySave(state);
        const { copy: sanitizedLegacy } = sanitizeState(state);
        this.storage.setItem(this.backupKey, JSON.stringify(sanitizedLegacy));
        const migratedValidation = validateState(state);
        if (!migratedValidation.valid) {
          this.discardInvalid(raw);
          this.warning = SAVE_WARNING.invalidSaveQuarantined;
          return null;
        }
        const { copy } = sanitizeState(state);
        this.storage.setItem(this.key, JSON.stringify(copy));
      }
      if (statePredatesReset(state, resetMarkerTime(this.storage))) {
        this.discardInvalid(raw);
        this.warning = SAVE_WARNING.resetMarkerDetected;
        return null;
      }
      const validation = validateState(state);
      if (!validation.valid) {
        this.discardInvalid(raw);
        this.warning = SAVE_WARNING.corruptSaveQuarantined;
        return null;
      }
      state.runtime.loadedFromKey = sourceKey;
      return state;
    } catch {
      this.warning = SAVE_WARNING.loadFailed;
      return null;
    }
  }

  save(state) {
    return this.saveState(state, { detached: false });
  }

  saveDetachedState(state) {
    return this.saveState(state, { detached: true });
  }

  saveState(state, { detached }) {
    if (!this.storage) throw new AppError(ErrorCode.STORAGE_UNAVAILABLE, 'ブラウザの保存領域を利用できません。');
    try {
      if (statePredatesReset(state, resetMarkerTime(this.storage))) return false;
      const { copy, timestamp } = sanitizeState(state, { detached });
      const serialized = JSON.stringify(copy);
      if (new TextEncoder().encode(serialized).length > MAX_SAVE_BYTES) {
        throw new Error('save data exceeds safe browser storage size');
      }
      this.storage.setItem(this.key, serialized);
      return timestamp;
    } catch (error) {
      this.markUnavailable(SAVE_WARNING.saveFailedProgressLost);
      throw new AppError(ErrorCode.STORAGE_UNAVAILABLE, 'ゲームの保存に失敗しました。', { details: error?.message });
    }
  }

  clear() {
    if (!this.storage) return false;
    try {
      const resetAt = Date.now();
      const explicitKeys = new Set([this.key, ...this.legacyKeys, this.backupKey, this.corruptBackupKey, 'frontline_roads_primary_tab_v2']);
      for (const key of storageKeys(this.storage)) {
        if (key.startsWith(APP_STORAGE_PREFIX) || explicitKeys.has(key)) this.storage.removeItem(key);
      }
      for (const key of explicitKeys) this.storage.removeItem(key);
      this.storage.setItem(RESET_MARKER_KEY, String(resetAt));
      try {
        const session = globalThis.sessionStorage;
        for (const key of storageKeys(session)) if (key.startsWith(APP_STORAGE_PREFIX)) session.removeItem(key);
      } catch {
        // Session storage cleanup is best-effort.
      }
      return true;
    } catch {
      this.markUnavailable();
      return false;
    }
  }
}
