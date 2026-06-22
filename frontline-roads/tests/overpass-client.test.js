import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENDPOINTS, OverpassClient } from '../src/roads/overpass-client.js';

test('default endpoints use current public global instances', () => {
  assert.deepEqual(DEFAULT_ENDPOINTS, [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ]);
  assert.ok(DEFAULT_ENDPOINTS.every(endpoint => !endpoint.includes('kumi.systems')));
  assert.ok(DEFAULT_ENDPOINTS.every(endpoint => !endpoint.includes('nchc.org.tw')));
});

test('query filters road classes before download', () => {
  const client = new OverpassClient({ fetchImpl: async () => { throw new Error('unused'); } });
  const query = client.buildQuery(35, 139, 1150);
  assert.match(query, /primary_link/);
  assert.match(query, /living_street/);
  assert.match(query, /access/);
  assert.match(query, /area/);
  assert.match(query, /around:1150,35,139/);
  assert.doesNotMatch(query, /way\["highway"\]\(/);
});

test('road request uses POST form encoding instead of a long GET URL', async () => {
  let captured = null;
  const client = new OverpassClient({
    endpoints: ['https://example.invalid/api/interpreter'],
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, async json() { return { elements: [] }; } };
    }
  });

  await client.fetchRoads(35, 139);
  assert.equal(captured.url, 'https://example.invalid/api/interpreter');
  assert.equal(captured.options.method, 'POST');
  assert.match(captured.options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  assert.match(captured.options.body, /^data=/);
  assert.doesNotMatch(captured.url, /\?data=/);
});

test('failed server falls back to the next endpoint', async () => {
  const calls = [];
  const client = new OverpassClient({
    endpoints: ['https://one.invalid', 'https://two.invalid'],
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes('one.invalid')) return { ok: false, status: 504, async json() { return {}; } };
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way' }] }; } };
    }
  });

  const result = await client.fetchRoads(35, 139);
  assert.deepEqual(calls, ['https://one.invalid', 'https://two.invalid']);
  assert.equal(result.elements.length, 1);
});

test('attempt callback receives endpoint progress', async () => {
  const attempts = [];
  const client = new OverpassClient({
    endpoints: ['https://one.invalid'],
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { elements: [] }; } })
  });
  await client.fetchRoads(35, 139, { onAttempt: attempt => attempts.push(attempt) });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].index, 1);
  assert.equal(attempts[0].total, 1);
  assert.equal(attempts[0].endpoint, 'https://one.invalid');
});

test('caller abort stops endpoint fallback immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = new OverpassClient({
    endpoints: ['https://one.invalid', 'https://two.invalid'],
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
