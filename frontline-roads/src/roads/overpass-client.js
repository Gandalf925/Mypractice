import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';

export const DEFAULT_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]);

const HIGHWAY_PATTERN = [
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street'
].join('|');

function endpointHost(endpoint) {
  try { return new URL(endpoint).hostname; }
  catch { return String(endpoint); }
}

function errorSummary(error) {
  if (error?.name === 'AbortError') return 'timeout';
  if (error?.name === 'TypeError' && /fetch/i.test(error?.message ?? '')) return 'browser-network-or-cors';
  return String(error?.message || error || 'unknown').replace(/\s+/g, ' ').slice(0, 120);
}

function validatePayload(data) {
  if (!Array.isArray(data?.elements)) throw new Error('invalid response payload');
  return data;
}

export class OverpassClient {
  constructor({ fetchImpl = globalThis.fetch, endpoints = DEFAULT_ENDPOINTS } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl;
    this.endpoints = [...endpoints];
  }

  buildQuery(lat, lon, radiusMeters = ROAD_CONFIG.fetchRadiusMeters) {
    return [
      '[out:json][timeout:35];',
      `way["highway"~"^(${HIGHWAY_PATTERN})$"]`,
      '["access"!~"^(private|no)$"]',
      '["area"!="yes"]',
      `(around:${radiusMeters},${lat},${lon});`,
      'out geom qt;'
    ].join('');
  }

  async fetchWithPost(endpoint, query, signal) {
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validatePayload(await response.json());
  }

  async runAttempt(endpoint, query, timeoutMs, callerSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      return await this.fetchWithPost(endpoint, query, controller.signal);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async fetchRoads(lat, lon, {
    signal,
    radiusMeters = ROAD_CONFIG.fetchRadiusMeters,
    onAttempt = null
  } = {}) {
    const query = this.buildQuery(lat, lon, radiusMeters);
    const startedAt = Date.now();
    const failures = [];

    for (let index = 0; index < this.endpoints.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const remainingTotal = ROAD_CONFIG.overpassTotalTimeoutMs - (Date.now() - startedAt);
      if (remainingTotal <= 0) break;

      const endpoint = this.endpoints[index];
      const timeoutMs = Math.min(ROAD_CONFIG.overpassTimeoutMs, remainingTotal);
      onAttempt?.({
        index: index + 1,
        total: this.endpoints.length,
        attempt: index + 1,
        totalAttempts: this.endpoints.length,
        transport: 'POST',
        timeoutMs,
        endpoint
      });

      try {
        return await this.runAttempt(endpoint, query, timeoutMs, signal);
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        failures.push(`${endpointHost(endpoint)} POST:${errorSummary(error)}`);
      }
    }

    const details = failures.length > 0 ? failures.join(' / ') : 'no endpoint completed';
    throw new AppError(
      ErrorCode.ROAD_REQUEST_FAILED,
      '道路データを取得できませんでした。下の診断内容をスクリーンショットで共有してください。',
      { details }
    );
  }
}
