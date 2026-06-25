import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { normalizeRuntimeState } from '../src/core/state-normalizer.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createRoadChunkState, ensureRoadChunkState, graphCoveredChunkIds } from '../src/roads/world-chunk-grid.js';
import { StateStore } from '../src/core/state-store.js';
import { EventBus } from '../src/core/event-bus.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function graph() {
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'gate-a', x: 100, y: 0 },
      { id: 'gate-b', x: 200, y: 0 },
      { id: 'survey', x: 500, y: 0 },
      { id: 'remote', x: 700, y: 0 }
    ],
    edges: [
      { id: 'road-1', a: 'home', b: 'gate-a', length: 100, roadWidth: 5 },
      { id: 'gate-road', a: 'gate-a', b: 'gate-b', length: 100, roadWidth: 5 },
      { id: 'road-2', a: 'gate-b', b: 'survey', length: 300, roadWidth: 5 },
      { id: 'road-3', a: 'survey', b: 'remote', length: 200, roadWidth: 5 }
    ]
  });
}

function stateWithFacilities() {
  const state = createInitialState();
  state.lifecycle = 'PLAYING';
  state.world.roadGraph = graph();
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true }];
  state.world.city = { nodeId: 'home', hp: 72, maxHp: 100 };
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  state.combat.defenses = [
    { id: 'broken-gate', kind: 'barrier', type: 'barrier', line: 'gate', tier: 2, defenseKey: 'gate2', edgeId: 'gate-road', hp: 0, maxHp: 700, ruined: true, isGate: true },
    { id: 'survey-1', kind: 'tower', type: 'survey', line: 'survey', tier: 1, defenseKey: 'survey1', nodeId: 'survey', hp: 160, maxHp: 160, ruined: false, cooldown: 0, disabledTimer: 0, buildAnchorKind: 'MAJOR', baseId: 'home-base', surveyNextAt: 1, surveyStatus: 'WAITING', surveyCompletedCount: 0 }
  ];
  state.runtime.combatInitialized = true;
  return state;
}

test('same-schema saves missing the old initialization flag remove destroyed facilities and preserve active survey facilities', () => {
  const state = stateWithFacilities();
  delete state.runtime.combatInitialized;
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'v0323-preserve');
  repository.save(state);
  const restored = repository.load();
  normalizeRuntimeState(restored);
  assert.equal(restored.runtime.combatInitialized, true);
  assert.deepEqual(restored.combat.defenses.map(defense => defense.id), ['survey-1']);
});

test('normalization removes zero-HP defenses even when legacy ruin flags are absent', () => {
  const state = stateWithFacilities();
  state.combat.defenses[0].ruined = false;
  normalizeRuntimeState(state);
  assert.deepEqual(state.combat.defenses.map(defense => defense.id), ['survey-1']);
});

test('loaded road chunks are reconstructed from the persisted graph so survey can expand from initial roads', () => {
  const state = stateWithFacilities();
  state.world.roadChunks = createRoadChunkState();
  const covered = graphCoveredChunkIds(state.world.roadGraph);
  assert.ok(covered.length >= 2);
  ensureRoadChunkState(state.world);
  for (const id of covered) {
    assert.ok(state.world.roadChunks.loaded.includes(id));
    assert.ok(state.world.roadChunks.integrated.includes(id));
  }
});

test('survey network failures become retry-wait state instead of a permanent raw error', async () => {
  let now = 100000;
  const state = stateWithFacilities();
  state.runtime.worldTimeMs = now;
  state.world.roadChunks = createRoadChunkState({ initialLoadedChunkIds: ['0:0'], initialObservedChunkIds: ['0:0'] });
  const store = new StateStore(state, new EventBus());
  const manager = new RoadWorldManager({
    store,
    cache: { isAvailable: () => false, async get() { return null; }, async put() { return false; } },
    roadService: { async loadChunk() { throw new Error('network unavailable'); } },
    now: () => now
  });
  const candidates = manager.considerSurveyFacilities();
  assert.equal(candidates.length, 1);
  while (manager.running) await new Promise(resolve => setTimeout(resolve, 0));
  const next = store.snapshot();
  const survey = next.combat.defenses.find(defense => defense.id === 'survey-1');
  assert.equal(survey.surveyStatus, 'RETRY_WAIT');
  assert.equal(survey.surveyErrorCount, 1);
  assert.match(survey.surveyLastError, /network unavailable/);
  assert.ok(survey.surveyRetryAt > now);
  manager.abort();
});

test('critical facility operations persist immediately and obsolete wreck UI is absent', async () => {
  const combatUi = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../src/rendering/combat-renderer.js', import.meta.url), 'utf8');
  assert.match(combatUi, /if \(result\?\.ok\) this\.persist\?\.\(\)/);
  assert.match(combatUi, /this\.persist\?\.\(\);\n\s*this\.notifications\.show\(`\$\{DEFENSE_DEFINITIONS/);
  assert.match(bootstrap, /combat:defense-destroyed['"], \(\) => this\.queueCriticalSave\(\)/);
  assert.match(bootstrap, /civilization:building-destroyed['"], \(\) => this\.queueCriticalSave\(\)/);
  assert.match(bootstrap, /addEventListener\?\.\('pagehide'/);
  assert.doesNotMatch(renderer, /drawRuinedGate|drawRuinedDefense|fillText\('OPEN'|fillText\('FIX'/);
  assert.doesNotMatch(combatUi, /破壊済み・敵通行可|残骸を撤去/);
});
