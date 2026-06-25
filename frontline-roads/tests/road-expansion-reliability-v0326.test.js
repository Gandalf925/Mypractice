import test from 'node:test';
import assert from 'node:assert/strict';
import { LifecycleState } from '../src/core/constants.js';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { OverpassClient, OVERPASS_TRANSPORT } from '../src/roads/overpass-client.js';
import { RoadService } from '../src/roads/road-service.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { createRoadChunkState, ensureRoadChunkState } from '../src/roads/world-chunk-grid.js';
import { xyToLatLon } from '../src/location/location-privacy.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { isAllowedWay } from '../src/roads/road-filter.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const CENTER = Object.freeze({ lat: 35, lon: 139 });

function baseGraph() {
  return attachGraphIndexes({
    nodes: [
      { id: 'home', x: 0, y: 300 },
      { id: 'frontier', x: 500, y: 300 }
    ],
    edges: [{
      id: 'known-road', a: 'home', b: 'frontier', length: 500, roadWidth: 5.5,
      lanes: 1, highway: 'residential', name: 'known road', oneway: false
    }],
    center: CENTER,
    source: 'fixture',
    roadSpecVersion: 2
  });
}

function location(x, y) {
  return xyToLatLon(x, y, CENTER);
}

function overpassPayload() {
  const points = [
    [500, 300], [700, 300], [900, 300], [1100, 300], [1300, 300]
  ];
  const driveway = [[700, 300], [700, 430]];
  return {
    version: 0.6,
    generator: 'Overpass API fixture',
    elements: [
      {
        type: 'way',
        id: 1001,
        nodes: points.map((_, index) => 2000 + index),
        tags: { highway: 'service', service: 'spur', name: 'frontier service road' },
        geometry: points.map(([x, y]) => location(x, y))
      },
      {
        type: 'way',
        id: 1002,
        nodes: driveway.map((_, index) => 3000 + index),
        tags: { highway: 'service', service: 'driveway' },
        geometry: driveway.map(([x, y]) => location(x, y))
      }
    ]
  };
}

function playableState({ survey = false } = {}) {
  const state = createInitialState();
  state.lifecycle = LifecycleState.PLAYING;
  state.world.roadGraph = baseGraph();
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.world.homeBase = {
    id: 'base-1', name: '本拠地', primary: true, status: 'ESTABLISHED',
    nodeId: 'home', x: 0, y: 300, hp: 100, maxHp: 100, selectedDistanceMeters: 0
  };
  state.world.playerBases = [{ ...state.world.homeBase }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 480, y: 300 };
  state.civilization.level = survey ? 1 : 0;
  if (survey) {
    state.combat.defenses.push({
      id: 'survey-1', kind: 'tower', type: 'survey', line: 'survey', tier: 1, defenseKey: 'survey1',
      nodeId: 'frontier', hp: 160, maxHp: 160, disabledTimer: 0,
      buildAnchorId: 'base', buildAnchorKind: 'MAJOR', baseId: 'base-1',
      surveyNextAt: 0, surveyRetryAt: 0, surveyStatus: 'WAITING', surveyCompletedCount: 0
    });
  }
  return state;
}

function actualRoadStack() {
  const transportCalls = [];
  const client = new OverpassClient({
    endpoints: ['https://fixture.test/api/interpreter'],
    fetchImpl: async (_url, options) => {
      transportCalls.push(options.method);
      throw new TypeError('Failed to fetch');
    },
    sandboxJsonpImpl: async (_endpoint, query) => {
      transportCalls.push(OVERPASS_TRANSPORT.SANDBOX_JSONP);
      assert.match(query, /service/);
      return overpassPayload();
    }
  });
  return { client, service: new RoadService(client), transportCalls };
}

async function settle(manager) {
  for (let index = 0; index < 100 && (manager.running || manager.queue.length > 0); index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.equal(manager.running, false, 'road acquisition queue should settle');
}

test('service roads are available while private driveway-like service ways remain excluded', () => {
  assert.equal(isAllowedWay({ highway: 'service', service: 'spur' }), true);
  assert.equal(isAllowedWay({ highway: 'service', service: 'driveway' }), false);
  assert.equal(isAllowedWay({ highway: 'road' }), true);
});

test('player frontier movement uses sandbox fallback, grows the live map and survives save restore', async () => {
  const state = playableState();
  const store = new StateStore(state, new EventBus());
  const { client, service, transportCalls } = actualRoadStack();
  const graphChanges = [];
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: service,
    onGraphChanged: detail => graphChanges.push(detail)
  });

  const queued = manager.considerLocation(location(480, 300));
  assert.ok(queued.includes('1:0'), 'approaching the known road end should request the forward chunk');
  await settle(manager);

  const expanded = store.snapshot();
  assert.deepEqual(transportCalls, ['POST', 'GET', OVERPASS_TRANSPORT.SANDBOX_JSONP]);
  assert.equal(client.getLastSuccess().transport, OVERPASS_TRANSPORT.SANDBOX_JSONP);
  assert.ok(expanded.world.roadChunks.loaded.includes('1:0'));
  assert.ok(expanded.world.roadGraph.nodes.some(node => node.x > 1000));
  assert.ok(expanded.world.roadGraph.edges.some(edge => edge.highway === 'service'));
  assert.ok(!expanded.world.roadGraph.edges.some(edge => edge.name === ''));
  assert.ok(graphChanges.some(change => change.chunkId === '1:0' && change.addedEdges > 0));

  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'road-expansion-v0326');
  repository.save(expanded);
  const restored = repository.load();
  attachGraphIndexes(restored.world.roadGraph);
  ensureRoadChunkState(restored.world);
  assert.ok(restored.world.roadChunks.loaded.includes('1:0'));
  assert.ok(restored.world.roadGraph.nodes.some(node => node.x > 1000));
});

test('wooden survey tower uses the same acquisition stack and records a real merged road result', async () => {
  const state = playableState({ survey: true });
  const store = new StateStore(state, new EventBus());
  const { service, transportCalls } = actualRoadStack();
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: service,
    now: () => state.runtime.worldTimeMs
  });

  const request = manager.requestSurvey('survey-1');
  assert.equal(request.ok, true);
  assert.equal(request.chunkId, '1:0');
  await settle(manager);

  const expanded = store.snapshot();
  const defense = expanded.combat.defenses.find(item => item.id === 'survey-1');
  assert.deepEqual(transportCalls, ['POST', 'GET', OVERPASS_TRANSPORT.SANDBOX_JSONP]);
  assert.ok(expanded.world.roadChunks.loaded.includes('1:0'));
  assert.ok(expanded.world.roadChunks.surveyed.includes('1:0'));
  assert.ok(!expanded.world.roadChunks.playerObserved.includes('1:0'));
  assert.equal(defense.surveyLastTransport, OVERPASS_TRANSPORT.SANDBOX_JSONP);
  assert.equal(defense.surveyLastEndpoint, 'fixture.test');
  assert.ok(defense.surveyLastRoadCount > 0);
  assert.ok(defense.surveyLastResponseElements > 0);
  assert.ok(expanded.world.roadGraph.nodes.some(node => node.x > 1000));
});

test('v2 false-empty and stale cache markers are released so old saves can expand again', () => {
  const state = playableState();
  state.world.roadChunks = {
    version: 2,
    sizeMeters: 600,
    loaded: ['0:0'],
    empty: ['1:0', '2:0'],
    cached: ['1:0'],
    integrated: ['0:0'],
    playerObserved: ['0:0', '1:0'],
    surveyed: [],
    failed: { '1:0': { at: Date.now(), message: 'old failure' } },
    updatedAt: Date.now()
  };
  const migrated = ensureRoadChunkState(state.world);
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.empty, []);
  assert.deepEqual(migrated.cached, []);
  assert.deepEqual(migrated.failed, {});
  assert.ok(!migrated.playerObserved.includes('1:0'));
});
