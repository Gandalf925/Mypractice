import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';

export const DEFAULT_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]);

const PREFERENCE_KEY = 'frontline_roads_overpass_preference_v1';
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

function safeBrowserStorage() {
  try { return globalThis.localStorage ?? null; }
  catch { return null; }
}

function radiusBounds(lat, lon, radiusMeters) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const radius = Math.max(1, Number(radiusMeters) || 1);
  const latitudeDelta = radius / 111320;
  const longitudeScale = Math.max(0.15, Math.cos(latitude * Math.PI / 180));
  const longitudeDelta = radius / (111320 * longitudeScale);
  return {
    south: latitude - latitudeDelta,
    west: longitude - longitudeDelta,
    north: latitude + latitudeDelta,
    east: longitude + longitudeDelta
  };
}

export class OverpassClient {
  constructor({ fetchImpl = globalThis.fetch, endpoints = DEFAULT_ENDPOINTS, preferenceStorage = safeBrowserStorage() } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl;
    this.endpoints = [...endpoints];
    this.preferenceStorage = preferenceStorage;
    this.preferredEndpoint = null;
    this.preferredTransports = new Map();
    this.lastSuccess = null;
    this.successSequence = 0;
    this.restorePreference();
  }

  restorePreference() {
    try {
      const value = JSON.parse(this.preferenceStorage?.getItem?.(PREFERENCE_KEY) ?? 'null');
      if (!value || !this.endpoints.includes(value.endpoint)) return;
      this.preferredEndpoint = value.endpoint;
      if (value.transport === 'GET' || value.transport === 'POST') {
        this.preferredTransports.set(value.endpoint, value.transport);
      }
    } catch {
      // Preference storage is optional; network requests remain functional without it.
    }
  }

  persistPreference(endpoint, transport) {
    try {
      this.preferenceStorage?.setItem?.(PREFERENCE_KEY, JSON.stringify({ endpoint, transport, updatedAt: Date.now() }));
    } catch {
      // Storage can be unavailable in private browsing. The in-memory preference still applies.
    }
  }

  orderedEndpoints() {
    if (!this.preferredEndpoint || !this.endpoints.includes(this.preferredEndpoint)) return [...this.endpoints];
    return [this.preferredEndpoint, ...this.endpoints.filter(endpoint => endpoint !== this.preferredEndpoint)];
  }

  buildQuery(lat, lon, radiusMeters = ROAD_CONFIG.fetchRadiusMeters, { shape = 'around' } = {}) {
    const selector = shape === 'bbox'
      ? (() => {
          const bounds = radiusBounds(lat, lon, radiusMeters);
          return `(${bounds.south.toFixed(7)},${bounds.west.toFixed(7)},${bounds.north.toFixed(7)},${bounds.east.toFixed(7)})`;
        })()
      : `(around:${radiusMeters},${lat},${lon})`;
    return [
      '[out:json][timeout:35];',
      `way["highway"~"^(${HIGHWAY_PATTERN})$"]`,
      '["access"!~"^(private|no)$"]',
      '["area"!="yes"]',
      `${selector};`,
      'out geom qt;'
    ].join('');
  }

  async fetchWithPost(endpoint, query, signal) {
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validatePayload(await response.json());
  }

  async fetchWithGet(endpoint, query, signal) {
    const url = new URL(endpoint);
    url.searchParams.set('data', query);
    const response = await this.fetchImpl(url.href, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validatePayload(await response.json());
  }

  async runAttempt(endpoint, query, timeoutMs, callerSignal, transport) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      return transport === 'GET'
        ? await this.fetchWithGet(endpoint, query, controller.signal)
        : await this.fetchWithPost(endpoint, query, controller.signal);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  recordSuccess(endpoint, transport, result) {
    this.preferredEndpoint = endpoint;
    this.preferredTransports.set(endpoint, transport);
    this.lastSuccess = Object.freeze({
      sequence: ++this.successSequence,
      endpoint,
      host: endpointHost(endpoint),
      transport,
      at: Date.now(),
      elementCount: result.elements.length
    });
    this.persistPreference(endpoint, transport);
  }

  getLastSuccess() {
    return this.lastSuccess ? { ...this.lastSuccess } : null;
  }

  async fetchRoads(lat, lon, {
    signal,
    radiusMeters = ROAD_CONFIG.fetchRadiusMeters,
    queryShape = 'around',
    onAttempt = null
  } = {}) {
    const query = this.buildQuery(lat, lon, radiusMeters, { shape: queryShape });
    const startedAt = Date.now();
    const failures = [];
    let attempt = 0;
    const endpoints = this.orderedEndpoints();
    const totalAttempts = endpoints.length * 2;

    for (let index = 0; index < endpoints.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const endpoint = endpoints[index];
      const preferred = this.preferredTransports.get(endpoint);
      const transports = preferred === 'GET' ? ['GET', 'POST'] : ['POST', 'GET'];

      for (const transport of transports) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const remainingTotal = ROAD_CONFIG.overpassTotalTimeoutMs - (Date.now() - startedAt);
        if (remainingTotal <= 0) break;
        attempt += 1;
        const timeoutMs = Math.min(ROAD_CONFIG.overpassTimeoutMs, remainingTotal);
        onAttempt?.({
          index: index + 1,
          total: endpoints.length,
          attempt,
          totalAttempts,
          transport,
          timeoutMs,
          endpoint,
          queryShape
        });

        try {
          const result = await this.runAttempt(endpoint, query, timeoutMs, signal, transport);
          this.recordSuccess(endpoint, transport, result);
          return result;
        } catch (error) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          failures.push(`${endpointHost(endpoint)} ${transport}:${errorSummary(error)}`);
        }
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
