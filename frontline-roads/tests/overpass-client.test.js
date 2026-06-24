import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENDPOINTS, OverpassClient } from '../src/roads/overpass-client.js';

test('default endpoints use the configured public instances', () => {
  assert.deepEqual(DEFAULT_ENDPOINTS, [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ]);
});

test('query filters road classes before download', () => {
  const client = new OverpassClient({ fetchImpl: async () => { throw new Error('unused'); } });
  const query = client.buildQuery(35, 139, 1150);
  assert.match(query, /primary_link/);
  assert.match(query, /living_street/);
  assert.match(query, /access/);
  assert.match(query, /area/);
  assert.match(query, /around:1150,35,139/);
  assert.match(query, /out geom qt/);
  assert.doesNotMatch(query, /way\["highway"\]\(/);
});

test('browser request starts with a form-encoded POST and stops after success', async () => {
  let captured = null;
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, async json() { return { elements: [] }; } };
    }
  });
  await client.fetchRoads(35, 139, { onAttempt: item => attempts.push(item) });
  assert.equal(captured.url, 'https://one.test/api/interpreter');
  assert.equal(captured.options.method, 'POST');
  assert.match(captured.options.body, /^data=/);
  assert.equal(captured.options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  assert.equal(captured.options.headers.Accept, 'application/json');
  assert.deepEqual(attempts.map(item => item.transport), ['POST']);
  assert.equal(attempts[0].totalAttempts, 2);
});

test('a blocked POST falls back to a non-script GET on the same endpoint', async () => {
  const calls = [];
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method === 'POST') throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way' }] }; } };
    }
  });
  const result = await client.fetchRoads(35, 139, { onAttempt: item => attempts.push(item) });
  assert.equal(result.elements.length, 1);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET']);
  assert.match(calls[1].url, /^https:\/\/one\.test\/api\/interpreter\?data=/);
  assert.deepEqual(attempts.map(item => item.transport), ['POST', 'GET']);
});

test('successful GET is remembered so later road expansions avoid the blocked POST', async () => {
  const methods = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async (_url, options) => {
      methods.push(options.method);
      if (options.method === 'POST') throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, async json() { return { elements: [] }; } };
    }
  });
  await client.fetchRoads(35, 139);
  await client.fetchRoads(35, 139);
  assert.deepEqual(methods, ['POST', 'GET', 'GET']);
});

test('failed POST and GET fall back to the next endpoint', async () => {
  const calls = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter', 'https://two.test/api/interpreter'],
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (url.includes('one.test')) return { ok: false, status: 504, async json() { return {}; } };
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way' }] }; } };
    }
  });
  const result = await client.fetchRoads(35, 139);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'POST']);
  assert.ok(calls[0].url.includes('one.test'));
  assert.ok(calls[1].url.includes('one.test'));
  assert.ok(calls[2].url.includes('two.test'));
  assert.equal(result.elements.length, 1);
});

test('all failures include endpoint and both secure transport diagnostics', async () => {
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
  await assert.rejects(client.fetchRoads(35, 139), error => {
    assert.match(error.details, /one\.test POST:browser-network-or-cors/);
    assert.match(error.details, /one\.test GET:browser-network-or-cors/);
    assert.doesNotMatch(error.details, /JSONP/);
    return true;
  });
});

test('caller abort stops attempts immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = new OverpassClient({
    endpoints: ['https://one.test', 'https://two.test'],
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

test('injected development fetch is used directly', async () => {
  let calls = 0;
  const client = new OverpassClient({
    endpoints: ['https://fixture.invalid/api'],
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, async json() { return { elements: [] }; } };
    }
  });
  const result = await client.fetchRoads(35, 139);
  assert.deepEqual(result, { elements: [] });
  assert.equal(calls, 1);
});

class MemoryPreferenceStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('chunk expansion query uses a compact bounding box instead of an around search', () => {
  const client = new OverpassClient({ fetchImpl: async () => { throw new Error('unused'); } });
  const query = client.buildQuery(35, 139, 520, { shape: 'bbox' });
  assert.doesNotMatch(query, /around:/);
  assert.match(query, /way\["highway"/);
  const match = query.match(/\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/);
  assert.ok(match, 'query should contain south, west, north and east bounds');
  assert.ok(Number(match[1]) < Number(match[3]));
  assert.ok(Number(match[2]) < Number(match[4]));
});

test('successful endpoint and transport survive a client recreation and are attempted first', async () => {
  const storage = new MemoryPreferenceStorage();
  const firstCalls = [];
  const first = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter', 'https://two.test/api/interpreter'],
    preferenceStorage: storage,
    fetchImpl: async (url, options) => {
      firstCalls.push({ url, method: options.method });
      if (url.includes('one.test')) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way' }] }; } };
    }
  });
  await first.fetchRoads(35, 139);
  assert.deepEqual(firstCalls.map(call => call.method), ['POST', 'GET', 'POST']);
  const firstSuccess = first.getLastSuccess();
  assert.equal(firstSuccess.sequence, 1);
  assert.equal(firstSuccess.endpoint, 'https://two.test/api/interpreter');
  assert.equal(firstSuccess.host, 'two.test');
  assert.equal(firstSuccess.transport, 'POST');
  assert.equal(firstSuccess.elementCount, 1);
  assert.ok(firstSuccess.at > 0);

  const secondCalls = [];
  const second = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter', 'https://two.test/api/interpreter'],
    preferenceStorage: storage,
    fetchImpl: async (url, options) => {
      secondCalls.push({ url, method: options.method });
      return { ok: true, status: 200, async json() { return { elements: [] }; } };
    }
  });
  await second.fetchRoads(35, 139);
  assert.equal(new URL(secondCalls[0].url).hostname, 'two.test');
  assert.equal(secondCalls[0].method, 'POST');
});

test('request metadata exposes the query shape for survey diagnostics', async () => {
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { elements: [] }; } })
  });
  await client.fetchRoads(35, 139, { queryShape: 'bbox', onAttempt: attempt => attempts.push(attempt) });
  assert.equal(attempts[0].queryShape, 'bbox');
});
