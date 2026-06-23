import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPwa } from '../src/app/pwa.js';

test('PWA registers the current service worker on HTTPS', async () => {
  const calls = [];
  const registration = { active: true };
  const result = await registerPwa({
    navigatorRef: { serviceWorker: { register: async (...args) => { calls.push(args); return registration; } } },
    locationRef: { protocol: 'https:', hostname: 'example.com', search: '' },
    globalRef: {},
    moduleUrl: 'https://example.com/Mypractice/frontline-roads/src/app/pwa.js'
  });
  assert.equal(result, registration);
  assert.deepEqual(calls, [['https://example.com/Mypractice/frontline-roads/sw.js', { scope: 'https://example.com/Mypractice/frontline-roads/', updateViaCache: 'none' }]]);
});

test('PWA is skipped for an allowed development fixture', async () => {
  let called = false;
  const result = await registerPwa({
    navigatorRef: { serviceWorker: { register: async () => { called = true; } } },
    locationRef: { protocol: 'http:', hostname: 'localhost', search: '?devFixture=1' },
    globalRef: {}
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

test('public devFixture query does not disable production PWA registration', async () => {
  let called = false;
  await registerPwa({
    navigatorRef: { serviceWorker: { register: async () => { called = true; return {}; } } },
    locationRef: { protocol: 'https:', hostname: 'example.com', search: '?devFixture=1' },
    globalRef: {}
  });
  assert.equal(called, true);
});

test('PWA registration failure does not stop the game', async () => {
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await registerPwa({
      navigatorRef: { serviceWorker: { register: async () => { throw new Error('blocked'); } } },
      locationRef: { protocol: 'https:', hostname: 'example.com', search: '' },
      globalRef: {}
    });
    assert.equal(result, null);
  } finally {
    console.warn = previousWarn;
  }
});
