import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ExplorationSystem, EXPLORATION_INTERACTION_RANGE_METERS, reconcileExplorationSites } from '../src/exploration/exploration-system.js';
import { FrontierSystem } from '../src/exploration/frontier-system.js';
import { drawExplorationSites } from '../src/rendering/exploration-renderer.js';

function makeState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    nodes: [
      { id: 'city', x: 0, y: 0 },
      { id: 'middle', x: 600, y: 0 },
      { id: 'source-node', x: 1250, y: 0 },
      { id: 'far-node', x: 1850, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'city', b: 'middle', length: 600, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false },
      { id: 'b', a: 'middle', b: 'source-node', length: 650, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false },
      { id: 'c', a: 'source-node', b: 'far-node', length: 600, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false }
    ],
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0 };
  state.world.city = { nodeId: 'city', hp: 100, maxHp: 100 };
  state.world.roadChunks = {
    version: 1, sizeMeters: 600, loaded: ['0:0', '1:0', '2:0', '3:0'], empty: [], cached: [], failed: {}, updatedAt: 0
  };
  state.world.frontierSources = [{
    id: 'source-1', point: { x: 1250, y: 0 }, entryNodeId: 'source-node', direction: { x: 1, y: 0 },
    profile: 'siege', threat: 3, status: 'LOCATED', signalStage: 'CONTACT', spawnClock: 0, spawnIntervalSec: 300,
    wavesSent: 0, createdAt: 0, discoveredAt: null, clearedAt: null
  }];
  state.player.worldPosition = { x: 1250, y: 0 };
  state.runtime.worldTimeMs = 100000;
  state.runtime.combatInitialized = true;
  return state;
}

test('loaded source chunk materializes a persistent enemy-source site', () => {
  const state = makeState();
  reconcileExplorationSites(state);
  const site = state.world.explorationSites.find(item => item.sourceId === 'source-1');
  assert.ok(site);
  assert.equal(site.type, 'enemySource');
  assert.equal(site.nodeId, 'source-node');
  assert.equal(state.world.frontierSources[0].status, 'DISCOVERED');
  reconcileExplorationSites(state);
  assert.equal(state.world.explorationSites.filter(item => item.sourceId === 'source-1').length, 1);
});

test('player can clear an enemy source on site and stop future frontier waves', () => {
  const state = makeState();
  const messages = [];
  const exploration = new ExplorationSystem({ emit(type, payload) { if (type === 'message') messages.push(payload.text); } });
  exploration.reconcile(state);
  const site = state.world.explorationSites.find(item => item.sourceId === 'source-1');
  const result = exploration.beginInteraction(state, site.id);
  assert.equal(result.ok, true);
  exploration.update(state, site.requiredSeconds + 0.1);
  assert.equal(site.status, 'CLEARED');
  assert.equal(state.world.frontierSources[0].status, 'CLEARED');
  assert.ok(state.inventory.resources.wood > 0);
  const clearedSourceEnemiesBefore = state.combat.enemies.filter(enemy => enemy.sourceBaseId === 'source-1').length;
  const frontier = new FrontierSystem(null);
  frontier.update(state, 1000);
  const clearedSourceEnemiesAfter = state.combat.enemies.filter(enemy => enemy.sourceBaseId === 'source-1').length;
  assert.equal(clearedSourceEnemiesAfter, clearedSourceEnemiesBefore);
  assert.ok(messages.some(message => message.includes('無力化')));
});

test('enemy source interaction requires proximity and a clear local area', () => {
  const state = makeState();
  const exploration = new ExplorationSystem(null);
  exploration.reconcile(state);
  const site = state.world.explorationSites.find(item => item.sourceId === 'source-1');
  state.player.worldPosition = { x: 1250 + EXPLORATION_INTERACTION_RANGE_METERS + 1, y: 0 };
  assert.equal(exploration.beginInteraction(state, site.id).ok, false);
  state.player.worldPosition = { x: 1250, y: 0 };
  state.combat.enemies.push({
    id: 'enemy', type: 'infantry', hp: 10, maxHp: 10, nodeId: 'source-node', edgeId: null, path: null,
    departDelay: 0, sourceBaseId: 'source-1'
  });
  const blocked = exploration.beginInteraction(state, site.id);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /排除/);
});

test('loaded chunks are processed once for deterministic ambient discoveries', () => {
  const state = makeState();
  reconcileExplorationSites(state);
  const processed = [...state.world.exploredSiteChunks];
  const count = state.world.explorationSites.length;
  reconcileExplorationSites(state);
  assert.deepEqual(state.world.exploredSiteChunks, processed);
  assert.equal(state.world.explorationSites.length, count);
  assert.ok(processed.includes('2:0'));
});

test('exploration renderer draws active sites with a minimal canvas context', () => {
  const state = makeState();
  reconcileExplorationSites(state);
  const calls = [];
  const context = {
    save() {}, restore() {}, beginPath() {}, arc() {}, fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); }, fillText() {},
    set textAlign(value) {}, set textBaseline(value) {}, set strokeStyle(value) {}, set fillStyle(value) {}, set lineWidth(value) {}, set font(value) {}
  };
  const camera = { viewportWidth: 800, viewportHeight: 600, worldToScreen(point) { return { x: 400 + point.x * 0.1, y: 300 + point.y * 0.1 }; } };
  drawExplorationSites(context, state, camera, 1000, { quality: 'balanced' });
  assert.ok(calls.includes('fill'));
  assert.ok(calls.includes('stroke'));
});
