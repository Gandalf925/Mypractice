import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';

// Current global public instances listed by the OpenStreetMap Overpass wiki.
// Keep this list small: every fallback request consumes shared public capacity.
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

function errorSummary(error) {
  if (error?.name === 'AbortError') return 'timeout';
  return error?.message || String(error);
}

export class OverpassClient {
  constructor({ fetchImpl = globalThis.fetch, endpoints = DEFAULT_ENDPOINTS } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl;
    this.endpoints = [...endpoints];
  }

  buildQuery(lat, lon, radiusMeters = ROAD_CONFIG.fetchRadiusMeters) {
    return [
      '[out:json][timeout:25];',
      `way["highway"~"^(${HIGHWAY_PATTERN})$"]`,
      '["access"!~"^(private|no)$"]',
      '["area"!="yes"]',
      `(around:${radiusMeters},${lat},${lon});`,
      'out geom;'
    ].join('');
  }

  async fetchRoads(lat, lon, {
    signal,
    radiusMeters = ROAD_CONFIG.fetchRadiusMeters,
    onAttempt = null
  } = {}) {
    const query = this.buildQuery(lat, lon, radiusMeters);
    const requestBody = new URLSearchParams({ data: query }).toString();
    const startedAt = Date.now();
    const failures = [];

    for (let index = 0; index < this.endpoints.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const elapsed = Date.now() - startedAt;
      const remainingTotal = ROAD_CONFIG.overpassTotalTimeoutMs - elapsed;
      if (remainingTotal <= 0) break;

      const endpoint = this.endpoints[index];
      const controller = new AbortController();
      const timeoutMs = Math.min(ROAD_CONFIG.overpassTimeoutMs, remainingTotal);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abortFromCaller = () => controller.abort();
      signal?.addEventListener('abort', abortFromCaller, { once: true });
      onAttempt?.({ index: index + 1, total: this.endpoints.length, timeoutMs, endpoint });

      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Accept': 'application/json'
          },
          body: requestBody,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'strict-origin-when-cross-origin',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data?.elements)) {
          throw new Error('invalid JSON response');
        }
        return data;
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        failures.push(`${index + 1}:${errorSummary(error)}`);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abortFromCaller);
      }
    }

    const details = failures.length > 0 ? failures.join(', ') : 'no endpoint completed';
    throw new AppError(
      ErrorCode.ROAD_REQUEST_FAILED,
      '道路データサーバーへ接続できませんでした。通信状態を確認し、少し待ってから再試行してください。',
      { details }
    );
  }
}
