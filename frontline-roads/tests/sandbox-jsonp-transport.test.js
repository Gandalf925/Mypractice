import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxJsonpUrl, sandboxJsonpRequest } from '../src/roads/sandbox-jsonp-transport.js';

class FakeWindow {
  constructor(payload) {
    this.payload = payload;
    this.listeners = new Set();
  }
  addEventListener(type, listener) { if (type === 'message') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'message') this.listeners.delete(listener); }
  emit(event) { for (const listener of [...this.listeners]) listener(event); }
}

class FakeDocument {
  constructor(windowRef) {
    this.windowRef = windowRef;
    this.lastFrame = null;
    this.body = {
      appendChild: frame => {
        this.lastFrame = frame;
        const channel = frame.srcdoc.match(/const channel = "([^"]+)"/)?.[1];
        queueMicrotask(() => this.windowRef.emit({ source: frame.contentWindow, data: { channel, type: 'ready' } }));
      }
    };
  }
  createElement(tag) {
    assert.equal(tag, 'iframe');
    const attributes = new Map();
    const frame = {
      hidden: false,
      tabIndex: 0,
      srcdoc: '',
      removed: false,
      referrerPolicy: '',
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      remove() { this.removed = true; },
      contentWindow: {
        postMessage: message => queueMicrotask(() => this.windowRef.emit({
          source: frame.contentWindow,
          data: { channel: message.channel, type: 'success', value: this.windowRef.payload }
        }))
      }
    };
    return frame;
  }
}

test('JSONP URL includes the Overpass query and isolated callback name', () => {
  const url = new URL(buildSandboxJsonpUrl('https://example.test/api/interpreter', '[out:json];way;', 'callback_1'));
  assert.equal(url.searchParams.get('data'), '[out:json];way;');
  assert.equal(url.searchParams.get('jsonp'), 'callback_1');
});

test('sandbox transport uses an opaque-origin iframe and returns only the validated payload', async () => {
  const payload = { elements: [{ type: 'way', id: 7 }] };
  const windowRef = new FakeWindow(payload);
  const documentRef = new FakeDocument(windowRef);
  const result = await sandboxJsonpRequest('https://example.test/api/interpreter', '[out:json];way;', {
    documentRef,
    windowRef,
    timeoutMs: 1000
  });

  assert.deepEqual(result, payload);
  const frame = documentRef.lastFrame;
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.doesNotMatch(frame.getAttribute('sandbox'), /allow-same-origin/);
  assert.equal(frame.hidden, true);
  assert.equal(frame.referrerPolicy, 'origin');
  assert.doesNotMatch(frame.srcdoc, /example\.test/);
  assert.doesNotMatch(frame.srcdoc, /\[out:json\]/);
  assert.equal(frame.removed, true);
  assert.equal(windowRef.listeners.size, 0);
});

test('sandbox transport aborts without leaving the iframe or message listener behind', async () => {
  const windowRef = new FakeWindow({ elements: [] });
  const documentRef = new FakeDocument(windowRef);
  documentRef.body.appendChild = frame => { documentRef.lastFrame = frame; };
  const controller = new AbortController();
  const request = sandboxJsonpRequest('https://example.test/api/interpreter', 'query', {
    documentRef,
    windowRef,
    signal: controller.signal,
    timeoutMs: 1000
  });
  controller.abort();
  await assert.rejects(request, error => error.name === 'AbortError');
  assert.equal(documentRef.lastFrame.removed, true);
  assert.equal(windowRef.listeners.size, 0);
});
