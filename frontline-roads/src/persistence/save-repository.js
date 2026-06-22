import { SAVE_KEY } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { validateState } from '../core/state-schema.js';
import { isLegacySave, migrateLegacySave } from './legacy-save-migration.js';

const DERIVED_GRAPH_KEYS = new Set(['nodeById', 'edgeById', 'adjacency']);

function serializeState(state) {
  return JSON.stringify(state, (key, value) => DERIVED_GRAPH_KEYS.has(key) ? undefined : value);
}

export class SaveRepository {
  constructor(storage = globalThis.localStorage, key = SAVE_KEY, legacyKeys = ['frontline_roads_refactor_v1', 'frontline_roads_pages_mvp_v31']) {
    this.storage = storage;
    this.key = key;
    this.legacyKeys = legacyKeys;
    this.backupKey = `${key}_legacy_backup`;
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
      let state = JSON.parse(raw);
      if (isLegacySave(state)) {
        if (!this.storage.getItem(this.backupKey)) this.storage.setItem(this.backupKey, raw);
        state = migrateLegacySave(state);
        this.storage.setItem(this.key, serializeState(state));
      }
      const validation = validateState(state);
      if (!validation.valid) return null;
      state.runtime.loadedFromKey = sourceKey;
      return state;
    } catch {
      return null;
    }
  }

  save(state) {
    if (!this.storage) throw new AppError(ErrorCode.STORAGE_UNAVAILABLE, 'ブラウザの保存領域を利用できません。');
    try {
      const copy = structuredClone(state);
      const timestamp = Date.now();
      copy.runtime.lastSavedAt = timestamp;
      copy.player.currentPosition = null;
      copy.player.locationAccuracy = null;
      copy.player.worldPosition = copy.world.homeBase ? { x: copy.world.homeBase.x, y: copy.world.homeBase.y } : null;
      this.storage.setItem(this.key, serializeState(copy));
      return timestamp;
    } catch (error) {
      throw new AppError(ErrorCode.STORAGE_UNAVAILABLE, 'ゲームの保存に失敗しました。', { details: error?.message });
    }
  }

  resetStorage() {
    this.storage?.setItem(this.key, '');
    for (const legacyKey of this.legacyKeys) this.storage?.setItem(legacyKey, '');
  }
}
