import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ENDPOINTS,
  OverpassClient,
  buildJsonpUrl,
  browserJsonpRequest
} from '../src/roads/overpass-client.js';

test('default endpoints use current public global instances', () => {
  assert.deepEqual(DEFAULT_ENDPOINTS, [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ]);
});

test('query filters road classes before download', () => {
  const client = new OverpassClient({ fetchImpl: async () => { throw new Error('unused'); }, jsonpImpl: null });
  const query = client.buildQuery(35, 139, 1150);
  assert.match(query, /primary_link/);
  assert.match(query, /living_street/);
  assert.match(query, /access/);
  assert.match(query, /area/);
  assert.match(query, /around:1150,35,139/);
  assert.match(query, /out geom qt/);
  assert.doesNotMatch(query, /way\["highway"\]\(/);
});

test('JSONP URL contains encoded query and callback', () => {
  const url = new URL(buildJsonpUrl('https://example.test/api/interpreter', '[out:json];out;', '__frontline_1'));
  assert.equal(url.searchParams.get('data'), '[out:json];out;');
  assert.equal(url.searchParams.get('jsonp'), '__frontline_1');
});

test('browser JSONP resolves payload and cleans callback', async () => {
  const globalRef = {};
  const appended = [];
  const documentRef = {
    createElement() {
      return {
        async: false,
        referrerPolicy: '',
        src: '',
        onerror: null,
        remove() { this.removed = true; }
      };
    },
    head: {
      appendChild(script) {
        appended.push(script);
        const callback = new URL(script.src).searchParams.get('jsonp');
        queueMicrotask(() => globalRef[callback]({ elements: [{ type: 'way' }] }));
      }
    }
  };
  const data = await browserJsonpRequest('https://example.test/api/interpreter', '[out:json];out;', {
    timeoutMs: 1000,
    documentRef,
    globalRef
  });
  assert.equal(data.elements.length, 1);
  assert.equal(appended.length, 1);
  const callback = new URL(appended[0].src).searchParams.get('jsonp');
  assert.equal(globalRef[callback], undefined);
  assert.equal(appended[0].removed, true);
});

test('browser mode prefers JSONP and does not call fetch after success', async () => {
  let fetchCalls = 0;
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    jsonpImpl: async () => ({ elements: [{ type: 'way' }] }),
    fetchImpl: async () => { fetchCalls += 1; throw new Error('unexpected'); }
  });
  const data = await client.fetchRoads(35, 139, { onAttempt: item => attempts.push(item) });
  assert.equal(data.elements.length, 1);
  assert.equal(fetchCalls, 0);
  assert.equal(attempts[0].transport, 'JSONP');
});

test('JSONP failure falls back to official minimal POST request', async () => {
  let captured = null;
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    jsonpImpl: async () => { throw new Error('jsonp-script-load-failed'); },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, async json() { return { elements: [] }; } };
    }
  });
  await client.fetchRoads(35, 139, { onAttempt: item => attempts.push(item) });
  assert.equal(captured.url, 'https://one.test/api/interpreter');
  assert.equal(captured.options.method, 'POST');
  assert.match(captured.options.body, /^data=/);
  assert.equal(captured.options.headers, undefined);
  assert.deepEqual(attempts.map(item => item.transport), ['JSONP', 'POST']);
});

test('failed endpoint falls back to the next endpoint', async () => {
  const calls = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test', 'https://two.test'],
    jsonpImpl: null,
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes('one.test')) return { ok: false, status: 504, async json() { return {}; } };
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way' }] }; } };
    }
  });
  const result = await client.fetchRoads(35, 139);
  assert.deepEqual(calls, ['https://one.test', 'https://two.test']);
  assert.equal(result.elements.length, 1);
});

test('all failures include endpoint and transport diagnostics', async () => {
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    jsonpImpl: async () => { throw new Error('script blocked'); },
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
  await assert.rejects(client.fetchRoads(35, 139), error => {
    assert.match(error.details, /one\.test JSONP:script blocked/);
    assert.match(error.details, /one\.test POST:browser-network-or-cors/);
    return true;
  });
});

test('caller abort stops attempts immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = new OverpassClient({
    endpoints: ['https://one.test', 'https://two.test'],
    jsonpImpl: null,
    fetchImpl: async (_url, options) => {
      calls += 1;
      controller.abort();
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error('unreachable');
    }
  });
  await assert.rejects(client.fetchRoads(35, 139, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(calls, 1);
});
