import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';

// Current global public instances listed by the OpenStreetMap Overpass wiki.
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

let jsonpSequence = 0;

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

export function buildJsonpUrl(endpoint, query, callbackName) {
  const url = new URL(endpoint);
  url.searchParams.set('data', query);
  url.searchParams.set('jsonp', callbackName);
  return url.href;
}

export function browserJsonpRequest(endpoint, query, {
  signal,
  timeoutMs,
  documentRef = globalThis.document,
  globalRef = globalThis
} = {}) {
  if (!documentRef?.createElement || !documentRef?.head || !globalRef) {
    return Promise.reject(new Error('jsonp-unavailable'));
  }

  const callbackName = `__frontlineRoadsJsonp_${Date.now()}_${jsonpSequence++}`;
  const script = documentRef.createElement('script');
  script.async = true;
  script.referrerPolicy = 'origin';
  script.src = buildJsonpUrl(endpoint, query, callbackName);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      signal?.removeEventListener('abort', abortRequest);
      script.onerror = null;
      script.remove?.();
      try { delete globalRef[callbackName]; }
      catch { globalRef[callbackName] = undefined; }
      handler(value);
    };

    const abortRequest = () => finish(reject, new DOMException('Aborted', 'AbortError'));
    globalRef[callbackName] = data => {
      try { finish(resolve, validatePayload(data)); }
      catch (error) { finish(reject, error); }
    };
    script.onerror = () => finish(reject, new Error('jsonp-script-load-failed'));
    timer = setTimeout(() => finish(reject, new DOMException('Timeout', 'AbortError')), timeoutMs);
    signal?.addEventListener('abort', abortRequest, { once: true });

    if (signal?.aborted) {
      abortRequest();
      return;
    }
    documentRef.head.appendChild(script);
  });
}

export class OverpassClient {
  constructor({
    fetchImpl = globalThis.fetch,
    endpoints = DEFAULT_ENDPOINTS,
    jsonpImpl = globalThis.document ? browserJsonpRequest : null
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetchImpl = fetchImpl;
    this.endpoints = [...endpoints];
    this.jsonpImpl = jsonpImpl;
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
    // Match the official Overpass browser example: no custom headers that could
    // trigger a CORS preflight or complicate redirects.
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validatePayload(await response.json());
  }

  async runAttempt(endpoint, query, transport, timeoutMs, callerSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      if (transport === 'JSONP') {
        return await this.jsonpImpl(endpoint, query, { signal: controller.signal, timeoutMs });
      }
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
    const transports = this.jsonpImpl ? ['JSONP', 'POST'] : ['POST'];
    const totalAttempts = this.endpoints.length * transports.length;
    let attemptNumber = 0;

    for (let index = 0; index < this.endpoints.length; index += 1) {
      const endpoint = this.endpoints[index];
      for (const transport of transports) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const remainingTotal = ROAD_CONFIG.overpassTotalTimeoutMs - (Date.now() - startedAt);
        if (remainingTotal <= 0) break;

        attemptNumber += 1;
        const timeoutMs = Math.min(ROAD_CONFIG.overpassTimeoutMs, remainingTotal);
        onAttempt?.({
          index: index + 1,
          total: this.endpoints.length,
          attempt: attemptNumber,
          totalAttempts,
          transport,
          timeoutMs,
          endpoint
        });

        try {
          return await this.runAttempt(endpoint, query, transport, timeoutMs, signal);
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
