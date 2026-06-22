import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { configuredRoadDataEndpoints, buildRoadDataQuery } from './road-data-settings.js';

export class RoadDataClient {
  constructor({ fetchImpl = globalThis.fetch, endpoints = configuredRoadDataEndpoints() } = {}) {
    this.fetchImpl = fetchImpl;
    this.endpoints = endpoints;
  }

  buildQuery(lat, lon, radiusMeters = ROAD_CONFIG.fetchRadiusMeters) {
    return buildRoadDataQuery(lat, lon, radiusMeters);
  }

  async fetchRoads(lat, lon, { signal, radiusMeters = ROAD_CONFIG.fetchRadiusMeters } = {}) {
    const query = this.buildQuery(lat, lon, radiusMeters);
    let lastError = null;
    for (const endpoint of this.endpoints) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const response = await this.fetchImpl(`${endpoint}?data=${encodeURIComponent(query)}`, { cache: 'no-store', signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.elements)) throw new Error('invalid response');
        return data;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      }
    }
    throw new AppError(ErrorCode.ROAD_REQUEST_FAILED, '道路データを取得できませんでした。通信状態を確認して再試行してください。', { details: lastError?.message });
  }
}
