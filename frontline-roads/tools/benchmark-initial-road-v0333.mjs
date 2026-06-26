import { performance } from 'node:perf_hooks';
import { RoadService } from '../src/roads/road-service.js';
import { ROAD_CONFIG } from '../src/core/constants.js';

const CENTER = Object.freeze({ lat: 35, lon: 139 });

function makeGrid({ lines = 31, points = 31, spacing = 0.00045 } = {}) {
  const elements = [];
  const halfLines = Math.floor(lines / 2);
  const halfPoints = Math.floor(points / 2);
  let id = 1;
  for (let row = -halfLines; row <= halfLines; row += 1) {
    const wayId = id++;
    elements.push({
      type: 'way',
      id: wayId,
      nodes: Array.from({ length: points }, (_, index) => wayId * 1000 + index),
      tags: { highway: row === 0 ? 'primary' : 'residential' },
      geometry: Array.from({ length: points }, (_, index) => ({
        lat: CENTER.lat + row * spacing,
        lon: CENTER.lon + (index - halfPoints) * spacing
      }))
    });
  }
  for (let column = -halfLines; column <= halfLines; column += 1) {
    const wayId = id++;
    elements.push({
      type: 'way',
      id: wayId,
      nodes: Array.from({ length: points }, (_, index) => wayId * 1000 + index),
      tags: { highway: column === 0 ? 'secondary' : 'residential' },
      geometry: Array.from({ length: points }, (_, index) => ({
        lat: CENTER.lat + (index - halfPoints) * spacing,
        lon: CENTER.lon + column * spacing
      }))
    });
  }
  return { elements };
}

function delay(value, milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve(value);
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function progressiveTrial(payload) {
  const startedAt = performance.now();
  let previewAt = null;
  let requests = 0;
  const service = new RoadService({
    async fetchRoads(_lat, _lon, options) {
      requests += 1;
      return delay(payload, options.radiusMeters === ROAD_CONFIG.fetchRadiusMeters ? 120 : 15, options.signal);
    }
  });
  const result = await service.loadInitialProgressive(CENTER, {
    previewDelayMs: 20,
    onPreview: () => { previewAt ??= performance.now() - startedAt; }
  });
  return {
    previewMs: previewAt,
    completeMs: performance.now() - startedAt,
    requests,
    source: result.source
  };
}

async function fastTrial(payload) {
  let requests = 0;
  const startedAt = performance.now();
  const service = new RoadService({
    async fetchRoads() {
      requests += 1;
      return delay(payload, 8);
    }
  });
  const result = await service.loadInitialProgressive(CENTER, { previewDelayMs: 20 });
  return { completeMs: performance.now() - startedAt, requests, previewShown: result.previewShown };
}

async function processingTrial(payload) {
  const service = new RoadService({ async fetchRoads() { return payload; } });
  const graph = await service.loadAround(CENTER);
  return {
    responseElements: payload.elements.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    ...graph.acquisitionReport.timings
  };
}

const payload = makeGrid();
const progressive = await progressiveTrial(payload);
const fast = await fastTrial(payload);
const processing = await processingTrial(payload);
const baselineVisibleMs = progressive.completeMs;
const previewVisibleMs = progressive.previewMs;
const result = {
  benchmark: 'initial-road-progressive-v0.33.3',
  environment: `Node ${process.version}`,
  methodology: 'Synthetic deterministic Overpass payload and scaled network waits; not a live Overpass or Android measurement.',
  scaledScenario: {
    completeNetworkWaitMs: 120,
    previewStartDelayMs: 20,
    previewNetworkWaitMs: 15,
    baselineMapVisibleMs: Number(baselineVisibleMs.toFixed(2)),
    progressiveMapVisibleMs: Number(previewVisibleMs.toFixed(2)),
    mapVisibleReductionPercent: Number(((1 - previewVisibleMs / baselineVisibleMs) * 100).toFixed(1)),
    completeReadyMs: Number(progressive.completeMs.toFixed(2)),
    requests: progressive.requests
  },
  fastPath: {
    completeNetworkWaitMs: 8,
    completeReadyMs: Number(fast.completeMs.toFixed(2)),
    requests: fast.requests,
    previewShown: fast.previewShown
  },
  processing
};
console.log(JSON.stringify(result, null, 2));
