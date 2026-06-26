import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function createWorker({ cacheMatch, fetchImpl }) {
  const handlers = new Map();
  const cache = { put: async () => {}, match: cacheMatch };
  const context = {
    URL,
    Promise,
    AbortController,
    location: { origin: 'https://example.com' },
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: fetchImpl,
    Response: { error: () => ({ error: true }) },
    caches: {
      match: cacheMatch,
      open: async () => cache,
      keys: async () => []
    },
    self: {
      addEventListener(type, listener) { handlers.set(type, listener); },
      skipWaiting: async () => {},
      clients: { claim: async () => {} }
    }
  };
  vm.runInNewContext(source, context);
  return handlers;
}

function dispatchFetch(handler, request) {
  let responsePromise = null;
  const background = [];
  handler({
    request,
    respondWith(value) { responsePromise = Promise.resolve(value); },
    waitUntil(value) { background.push(value); }
  });
  return { responsePromise, background };
}

test('cached JavaScript is returned even when the resumed network request never settles', async () => {
  const cached = { source: 'installed-cache' };
  const handlers = createWorker({
    cacheMatch: async request => request.mode === 'navigate' ? null : cached,
    fetchImpl: () => new Promise(() => {})
  });
  const { responsePromise, background } = dispatchFetch(handlers.get('fetch'), {
    method: 'GET',
    mode: 'cors',
    url: 'https://example.com/Mypractice/frontline-roads/src/app/bootstrap.js?v=0.33.1'
  });
  assert.equal(await responsePromise, cached);
  assert.equal(background.length, 1);
});

test('navigation falls back to the installed HTML when the network fails during tab restoration', async () => {
  const shell = { source: 'cached-index' };
  const handlers = createWorker({
    cacheMatch: async request => request === './index.html' ? shell : null,
    fetchImpl: async () => { throw new Error('network suspended'); }
  });
  const { responsePromise } = dispatchFetch(handlers.get('fetch'), {
    method: 'GET',
    mode: 'navigate',
    url: 'https://example.com/Mypractice/frontline-roads/'
  });
  assert.equal(await responsePromise, shell);
});
