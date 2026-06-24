import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createRoadChunkState, parseChunkId } from '../src/roads/world-chunk-grid.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { DEFENSE_DEFINITIONS, defenseRuntimeDefinition } from '../src/combat/definitions.js';
import { applyDefenseTier, defenseUpgradeStatus } from '../src/civilization/defense-upgrade.js';
import { activeSurveyFacilities, surveyChunkCandidates, surveyFacilityPresentation } from '../src/exploration/survey-system.js';
import { reconcileExplorationSites } from '../src/exploration/exploration-system.js';
import { reconcileFrontiers } from '../src/exploration/frontier-system.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';
import { MemoryRoadChunkCache } from '../src/persistence/road-chunk-cache.js';
import { SaveRepository } from '../src/persistence/save-repository.js';
import { WaveSystem } from '../src/combat/wave-system.js';


class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function graph() {
  return attachGraphIndexes({
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'near', x: 60, y: 0 },
      { id: 'edge', x: 550, y: 0 },
      { id: 'remote', x: 700, y: 20 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'near', length: 60, roadWidth: 5 },
      { id: 'b', a: 'near', b: 'edge', length: 490, roadWidth: 5 },
      { id: 'c', a: 'edge', b: 'remote', length: 151, roadWidth: 5 }
    ],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2
  });
}

function stateForSurvey({ level = 1, towerNodeId = 'edge' } = {}) {
  const state = createInitialState();
  state.world.roadGraph = graph();
  state.world.homeBase = { id: 'base-1', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.roadChunks = {
    ...createRoadChunkState({ fetchRadiusMeters: 1 }),
    loaded: ['0:0'], integrated: ['0:0'], playerObserved: ['0:0'], surveyed: [], empty: [], cached: [], failed: {}
  };
  state.civilization.level = level;
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500, timber: 100, rope: 100, cutStone: 100, bronzeIngot: 100, wroughtIron: 100 });
  state.inventory.capacity = { base: 2000, processed: 2000, ore: 1000, metal: 1000 };
  if (towerNodeId) {
    state.combat.defenses.push({
      id: 'survey-1', kind: 'tower', type: 'survey', line: 'survey', tier: 1, defenseKey: 'survey1',
      nodeId: towerNodeId, hp: 160, maxHp: 160, ruined: false, disabledTimer: 0,
      buildAnchorId: 'base', surveyNextAt: 0, surveyStatus: 'WAITING', surveyCompletedCount: 0
    });
  }
  return state;
}

function incomingChunk(id = '1:0') {
  return attachGraphIndexes({
    nodes: [
      { id: 'join', x: 550, y: 0, chunkIds: [id] },
      { id: 'new-road', x: 900, y: 100, chunkIds: [id] }
    ],
    edges: [{ id: 'new-edge', a: 'join', b: 'new-road', length: 365, roadWidth: 5, chunkIds: [id] }],
    center: { lat: 35, lon: 139 }, source: 'test-chunk', roadSpecVersion: 2, chunkId: id
  });
}

test('survey facility is a civilization level 1 tower with approved tier progression', () => {
  assert.equal(DEFENSE_DEFINITIONS.survey.initialTier, 1);
  assert.equal(DEFENSE_DEFINITIONS.survey.requiredCivilizationLevel, 1);
  assert.equal(DEFENSE_DEFINITIONS.survey.surveyRadius, 600);
  assert.equal(DEFENSE_DEFINITIONS.survey.scanInterval, 180);
  const defense = stateForSurvey().combat.defenses[0];
  applyDefenseTier(defense, 4);
  const runtime = defenseRuntimeDefinition(defense);
  assert.equal(runtime.surveyRadius, 1600);
  assert.equal(runtime.scanInterval, 90);
});

test('survey facility cannot be built before civilization level 1 or from the player-only build zone', () => {
  const locked = stateForSurvey({ level: 0, towerNodeId: null });
  locked.player.worldPosition = { x: 550, y: 0 };
  const build = new BuildSystem();
  assert.equal(build.getBuildStatus(locked, 'survey').ok, false);
  assert.match(build.getBuildStatus(locked, 'survey').reason, /文明Lv\.1/);
  assert.deepEqual(build.listBuildSites(locked, 'survey'), []);

  const unlocked = stateForSurvey({ level: 1, towerNodeId: null });
  unlocked.player.worldPosition = { x: 550, y: 0 };
  const sites = build.listBuildSites(unlocked, 'survey');
  assert.ok(sites.every(site => site.anchorKind === 'MAJOR' || site.anchorKind === 'FIELD'));
  assert.ok(!sites.some(site => site.nodeId === 'edge'));
});

test('each owned base can operate only one active survey facility', () => {
  const state = stateForSurvey({ level: 1, towerNodeId: null });
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'survey', { x: 60, y: 0 }, 5);
  assert.equal(preview.ok, true);
  const built = build.buildCandidate(state, preview.candidate);
  assert.equal(built.ok, true);
  assert.equal(built.defense.tier, 1);
  assert.equal(built.defense.buildAnchorId, 'base');
  assert.equal(build.listBuildSites(state, 'survey').length, 0);
});

test('survey candidate selection expands one adjacent unloaded chunk inside the tier radius', () => {
  const state = stateForSurvey();
  const defense = state.combat.defenses[0];
  const candidates = surveyChunkCandidates(state, defense);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(candidate => !state.world.roadChunks.loaded.includes(candidate.id)));
  assert.ok(candidates.some(candidate => candidate.id === '1:0'));
});

test('survey-loaded roads are recorded separately from physically observed regions', async () => {
  const state = stateForSurvey();
  const store = new StateStore(state, new EventBus());
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: { async loadChunk({ chunkId }) { return incomingChunk(chunkId); } }
  });
  await manager.loadChunk(parseChunkId('1:0'), state.world.roadGraph.center, { mode: 'survey', defenseId: 'survey-1' });
  const next = store.snapshot();
  assert.ok(next.world.roadChunks.loaded.includes('1:0'));
  assert.ok(next.world.roadChunks.surveyed.includes('1:0'));
  assert.ok(!next.world.roadChunks.playerObserved.includes('1:0'));
  assert.equal(next.combat.defenses[0].surveyCompletedCount, 1);
});

test('remote survey does not reveal exact frontier sources or ambient exploration sites', () => {
  const state = stateForSurvey();
  state.world.roadChunks.loaded.push('1:0');
  state.world.roadChunks.surveyed.push('1:0');
  state.world.frontierSources = [{
    id: 'source-1', point: { x: 900, y: 100 }, entryNodeId: 'edge', direction: { x: 1, y: 0 },
    profile: 'patrol', threat: 1, status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 100,
    spawnIntervalSec: 400, wavesSent: 0, createdAt: 0
  }];
  reconcileFrontiers(state);
  reconcileExplorationSites(state);
  assert.equal(state.world.frontierSources[0].status, 'UNCONFIRMED');
  assert.equal(state.world.explorationSites.length, 0);
});

test('entering a surveyed chunk promotes it to physical observation and reveals local content', () => {
  const state = stateForSurvey();
  state.world.roadChunks.loaded.push('1:0');
  state.world.roadChunks.surveyed.push('1:0');
  state.world.frontierSources = [{
    id: 'source-1', point: { x: 900, y: 100 }, entryNodeId: 'remote', direction: { x: 1, y: 0 },
    profile: 'patrol', threat: 1, status: 'UNCONFIRMED', signalStage: 'DISTANT', spawnClock: 100,
    spawnIntervalSec: 400, wavesSent: 0, createdAt: 0
  }];
  state.player.worldPosition = { x: 900, y: 100 };
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({
    store,
    cache: new MemoryRoadChunkCache(),
    roadService: { async loadChunk() { throw new Error('not needed'); } },
    onGraphChanged: () => store.transaction(draft => {
      reconcileFrontiers(draft);
      reconcileExplorationSites(draft);
    })
  });
  manager.considerLocation({ lat: 35, lon: 139 });
  manager.abort();
  const next = store.snapshot();
  assert.ok(next.world.roadChunks.playerObserved.includes('1:0'));
  assert.ok(next.world.explorationSites.some(site => site.sourceId === 'source-1'));
});

test('survey scheduler serializes facilities and enforces a global real-time cooldown', () => {
  let now = 100000;
  const state = stateForSurvey();
  state.runtime.worldTimeMs = now;
  state.combat.defenses.push({ ...state.combat.defenses[0], id: 'survey-2', nodeId: 'remote', buildAnchorId: 'field:x', surveyNextAt: 1 });
  const store = new StateStore(state, new EventBus());
  store.transaction(draft => attachGraphIndexes(draft.world.roadGraph));
  const manager = new RoadWorldManager({ store, cache: new MemoryRoadChunkCache(), roadService: {}, now: () => now });
  const queued = [];
  manager.enqueue = (chunk, center, options) => queued.push({ chunk, center, options });
  assert.equal(manager.considerSurveyFacilities().length, 1);
  assert.equal(queued.length, 1);
  store.transaction(draft => { draft.combat.defenses[1].surveyNextAt = 1; });
  assert.deepEqual(manager.considerSurveyFacilities(), []);
  now += 30000;
  state.runtime.worldTimeMs = now;
  store.transaction(draft => { draft.runtime.worldTimeMs = now; });
  assert.equal(manager.considerSurveyFacilities().length, 1);
  assert.equal(queued.length, 2);
});

test('survey status reports radius, cadence and remaining expansion work', () => {
  const state = stateForSurvey();
  state.runtime.worldTimeMs = 1000;
  const defense = state.combat.defenses[0];
  defense.surveyNextAt = 61000;
  defense.surveyCompletedCount = 3;
  const presentation = surveyFacilityPresentation(state, defense);
  assert.equal(presentation.radius, 600);
  assert.equal(presentation.intervalSeconds, 180);
  assert.equal(presentation.nextScanSeconds, 60);
  assert.equal(presentation.completedCount, 3);
  assert.ok(presentation.remainingChunks > 0);
});

test('survey tower upgrade remains gated by the matching civilization level', () => {
  const state = stateForSurvey({ level: 1 });
  const defense = state.combat.defenses[0];
  const locked = defenseUpgradeStatus(state, defense);
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /文明Lv\.2/);
  state.civilization.level = 2;
  const available = defenseUpgradeStatus(state, defense);
  assert.equal(available.ok, true);
  assert.equal(available.nextDefinition.surveyRadius, 900);
});


test('a survey facility anchored to a destroyed simple base stops operating until the base is rebuilt', () => {
  const state = stateForSurvey();
  state.world.fieldBases = [{
    id: 'field-1', kind: 'FIELD', name: '簡易拠点 1', status: 'ESTABLISHED',
    nodeId: 'remote', x: 700, y: 20, hp: 40, maxHp: 40, establishedAt: 1
  }];
  const defense = state.combat.defenses[0];
  defense.nodeId = 'remote';
  defense.buildAnchorId = 'field:field-1';
  defense.buildAnchorKind = 'FIELD';
  defense.baseId = 'field-1';
  assert.equal(activeSurveyFacilities(state).length, 1);
  state.world.fieldBases[0].status = 'DESTROYED';
  state.world.fieldBases[0].hp = 0;
  assert.equal(activeSurveyFacilities(state).length, 0);
  state.world.fieldBases[0].status = 'ESTABLISHED';
  state.world.fieldBases[0].hp = 40;
  assert.equal(activeSurveyFacilities(state).length, 1);
});

test('survey-only road chunks do not receive exact enemy bases before physical observation', () => {
  const state = createInitialState();
  const nodes = [0, 180, 340, 550, 700, 900, 1100].map((x, index) => ({ id: `n${index}`, x, y: 0 }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e${index}`, a: node.id, b: nodes[index + 1].id, length: nodes[index + 1].x - node.x, roadWidth: 5
  }));
  state.world.roadGraph = attachGraphIndexes({ nodes, edges, center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2 });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'n0', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true }];
  state.world.city = { nodeId: 'n0', hp: 100, maxHp: 100 };
  state.world.roadChunks = {
    ...createRoadChunkState({ fetchRadiusMeters: 1 }),
    loaded: ['0:0', '1:0'], integrated: ['0:0', '1:0'], playerObserved: ['0:0'], surveyed: ['1:0'], empty: [], cached: [], failed: {}
  };
  new WaveSystem().ensureUnlockedBases(state);
  assert.ok(state.world.enemyBases.length > 0);
  assert.ok(state.world.enemyBases.every(base => state.world.roadGraph.nodeById.get(base.nodeId).x < 600));
});

test('survey progress and physical-observation boundaries survive save and restore', () => {
  const state = stateForSurvey();
  state.world.roadChunks.loaded.push('1:0');
  state.world.roadChunks.integrated.push('1:0');
  state.world.roadChunks.surveyed.push('1:0');
  const defense = state.combat.defenses[0];
  defense.surveyNextAt = 456789;
  defense.surveyLastChunkId = '1:0';
  defense.surveyCompletedCount = 4;
  const repository = new SaveRepository(new MemoryStorage(), 'survey-save');
  repository.save(state);
  const restored = repository.load();
  assert.deepEqual(restored.world.roadChunks.playerObserved, ['0:0']);
  assert.ok(restored.world.roadChunks.surveyed.includes('1:0'));
  const restoredDefense = restored.combat.defenses.find(item => item.id === defense.id);
  assert.equal(restoredDefense.surveyNextAt, 456789);
  assert.equal(restoredDefense.surveyLastChunkId, '1:0');
  assert.equal(restoredDefense.surveyCompletedCount, 4);
});
