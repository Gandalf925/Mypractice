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

test('browser request uses one minimal POST attempt per endpoint', async () => {
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
  assert.equal(captured.options.headers, undefined);
  assert.deepEqual(attempts.map(item => item.transport), ['POST']);
  assert.equal(attempts[0].totalAttempts, 1);
});

test('failed endpoint falls back to the next endpoint', async () => {
  const calls = [];
  const client = new OverpassClient({
    endpoints: ['https://one.test', 'https://two.test'],
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

test('all failures include endpoint and POST diagnostics', async () => {
  const client = new OverpassClient({
    endpoints: ['https://one.test/api/interpreter'],
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
  await assert.rejects(client.fetchRoads(35, 139), error => {
    assert.match(error.details, /one\.test POST:browser-network-or-cors/);
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
