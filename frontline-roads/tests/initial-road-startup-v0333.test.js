import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OverpassClient } from '../src/roads/overpass-client.js';
import { RoadService } from '../src/roads/road-service.js';
import { ROAD_CONFIG } from '../src/core/constants.js';

const CENTER = Object.freeze({ lat: 35, lon: 139 });

function makeGrid(center = CENTER) {
  const elements = [];
  const spacing = 0.0015;
  let id = 1;
  for (let row = -3; row <= 3; row += 1) {
    elements.push({
      type: 'way',
      id: id++,
      nodes: Array.from({ length: 7 }, (_, index) => id * 100 + index),
      tags: { highway: row === 0 ? 'primary' : 'residential', name: `row ${row}` },
      geometry: Array.from({ length: 7 }, (_, index) => ({ lat: center.lat + row * spacing, lon: center.lon + (index - 3) * spacing }))
    });
  }
  for (let column = -3; column <= 3; column += 1) {
    elements.push({
      type: 'way',
      id: id++,
      nodes: Array.from({ length: 7 }, (_, index) => id * 100 + index),
      tags: { highway: column === 0 ? 'secondary' : 'residential', name: `column ${column}` },
      geometry: Array.from({ length: 7 }, (_, index) => ({ lat: center.lat + (index - 3) * spacing, lon: center.lon + column * spacing }))
    });
  }
  return { elements };
}

function delayed(value, milliseconds, signal, { reject = false } = {}) {
  return new Promise((resolve, rejectPromise) => {
    if (signal?.aborted) {
      rejectPromise(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      reject ? rejectPromise(value) : resolve(value);
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      rejectPromise(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

test('preview acquisition rotates away from the endpoint used by the complete request', async () => {
  const calls = [];
  const client = new OverpassClient({
    endpoints: [
      'https://one.test/api/interpreter',
      'https://two.test/api/interpreter',
      'https://three.test/api/interpreter'
    ],
    sandboxJsonpImpl: null,
    fetchImpl: async (url, options) => {
      calls.push({ host: new URL(url).hostname, method: options.method });
      return { ok: true, status: 200, async json() { return { elements: [{ type: 'way', id: 1 }] }; } };
    }
  });
  await client.fetchRoads(CENTER.lat, CENTER.lon, { endpointOffset: 1 });
  assert.equal(calls[0].host, 'two.test');
  assert.equal(calls[0].method, 'POST');
});

test('a fast complete acquisition remains a single request and never starts preview loading', async () => {
  const calls = [];
  const previews = [];
  const service = new RoadService({
    async fetchRoads(_lat, _lon, options) {
      calls.push(options.radiusMeters);
      return makeGrid();
    }
  });
  const result = await service.loadInitialProgressive(CENTER, {
    previewDelayMs: 30,
    onPreview: graph => previews.push(graph)
  });
  assert.equal(result.source, 'full');
  assert.equal(result.previewShown, false);
  assert.deepEqual(calls, [ROAD_CONFIG.fetchRadiusMeters]);
  assert.equal(previews.length, 0);
});

test('a slow complete acquisition exposes a central preview and then returns the complete graph', async () => {
  const calls = [];
  const previews = [];
  let releaseFull;
  let signalFullReady;
  const fullReady = new Promise(resolve => { signalFullReady = resolve; });
  const fullResponse = new Promise(resolve => { releaseFull = resolve; });
  let signalPreviewReady;
  const previewReady = new Promise(resolve => { signalPreviewReady = resolve; });
  const service = new RoadService({
    async fetchRoads(_lat, _lon, options) {
      calls.push({ radius: options.radiusMeters, endpointOffset: options.endpointOffset });
      if (options.radiusMeters === ROAD_CONFIG.fetchRadiusMeters) {
        signalFullReady();
        return fullResponse;
      }
      return makeGrid();
    }
  });
  const loading = service.loadInitialProgressive(CENTER, {
    previewDelayMs: 0,
    onPreview: graph => {
      previews.push(graph);
      signalPreviewReady();
    }
  });
  await fullReady;
  await previewReady;
  releaseFull(makeGrid());
  const result = await loading;
  assert.equal(result.source, 'full');
  assert.equal(result.previewShown, true);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].acquisitionReport.mode, 'initial-preview');
  assert.equal(previews[0].acquisitionReport.retention.meters, ROAD_CONFIG.initialPreviewRetentionRadiusMeters);
  assert.equal(result.graph.acquisitionReport.mode, 'initial');
  assert.deepEqual(calls, [
    { radius: ROAD_CONFIG.fetchRadiusMeters, endpointOffset: 0 },
    { radius: ROAD_CONFIG.initialPreviewFetchRadiusMeters, endpointOffset: 1 }
  ]);
  assert.equal(service.lastGraph, result.graph);
});

test('a valid preview remains usable when the complete acquisition fails', async () => {
  const service = new RoadService({
    async fetchRoads(_lat, _lon, options) {
      if (options.radiusMeters === ROAD_CONFIG.fetchRadiusMeters) {
        return delayed(new Error('full endpoint failed'), 15, options.signal, { reject: true });
      }
      return delayed(makeGrid(), 2, options.signal);
    }
  });
  let displayed = false;
  const result = await service.loadInitialProgressive(CENTER, {
    previewDelayMs: 0,
    onPreview: () => { displayed = true; }
  });
  assert.equal(result.source, 'preview-fallback');
  assert.equal(result.previewShown, true);
  assert.equal(displayed, true);
  assert.match(result.fullError.message, /full endpoint failed/);
  assert.equal(result.graph.acquisitionReport.mode, 'initial-preview');
  assert.equal(service.lastGraph, result.graph);
});

test('caller cancellation aborts both complete and preview acquisitions', async () => {
  const controller = new AbortController();
  let abortedCalls = 0;
  const service = new RoadService({
    async fetchRoads(_lat, _lon, options) {
      try {
        return await delayed(makeGrid(), 200, options.signal);
      } catch (error) {
        if (error.name === 'AbortError') abortedCalls += 1;
        throw error;
      }
    }
  });
  const loading = service.loadInitialProgressive(CENTER, {
    signal: controller.signal,
    previewDelayMs: 0
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(loading, error => error.name === 'AbortError');
  assert.equal(abortedCalls, 2);
});

test('initial acquisition reports network, parsing, graph and total timings', async () => {
  let time = 0;
  const service = new RoadService({ async fetchRoads() { return makeGrid(); } }, { clock: () => time += 2 });
  const phases = [];
  const graph = await service.loadAround(CENTER, { onPhase: event => phases.push(event.phase) });
  assert.deepEqual(phases, ['network', 'parse', 'graph', 'ready']);
  assert.deepEqual(graph.acquisitionReport.timings, {
    fetchMs: 2,
    parseMs: 2,
    graphMs: 2,
    totalMs: 14
  });
});

test('bootstrap keeps preview selection visible but locked until the complete graph arrives', async () => {
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  const screen = await readFile(new URL('../src/ui/base-placement-screen.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /loadInitialProgressive/);
  assert.match(bootstrap, /onPreview: graph/);
  assert.match(bootstrap, /roadsPending: this\.initialRoadExpansionPending/);
  assert.match(bootstrap, /if \(this\.initialRoadExpansionPending\)/);
  assert.match(screen, /this\.confirmButton\.disabled = roadsPending/);
});

test('preview fallback confirms the selected base area before starting while ordinary movement expansion remains independent', async () => {
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  const manager = await readFile(new URL('../src/roads/road-world-manager.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /async confirmBase\(\)/);
  assert.match(bootstrap, /if \(this\.initialRoadFallback\)/);
  assert.match(bootstrap, /ensureAreaAroundPoint\(selectedPoint/);
  assert.match(bootstrap, /initialBaseCoverageRadiusMeters/);
  assert.match(manager, /considerLocation\(location\)/);
  assert.match(manager, /movementExpansionCandidates\(graph, worldPoint, this\.lastMovementPoint/);
  assert.doesNotMatch(manager, /considerLocation[\s\S]{0,1200}reachableRoadNodeIds/);
});
