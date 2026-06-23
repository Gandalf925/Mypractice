import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { createRoadChunkState } from '../src/roads/world-chunk-grid.js';
import {
  FrontierSystem,
  findFrontierCandidates,
  frontierPresentation,
  reconcileFrontiers
} from '../src/exploration/frontier-system.js';
import { drawFrontierSignals } from '../src/rendering/frontier-renderer.js';

function makeGraph(extended = false) {
  const nodes = [
    { id: 'city', x: 0, y: 0 },
    { id: 'middle', x: 300, y: 0 },
    { id: 'edge', x: 550, y: 0 }
  ];
  const edges = [
    { id: 'a', a: 'city', b: 'middle', length: 300, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false },
    { id: 'b', a: 'middle', b: 'edge', length: 250, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false }
  ];
  if (extended) {
    nodes.push({ id: 'next-edge', x: 1150, y: 0 });
    edges.push({ id: 'c', a: 'edge', b: 'next-edge', length: 600, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false });
  }
  return attachGraphIndexes({ nodes, edges, center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2 });
}

function stateForFrontier(extended = false) {
  const state = createInitialState();
  state.world.roadGraph = makeGraph(extended);
  state.world.city = { nodeId: 'city', hp: 100, maxHp: 100 };
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0 };
  state.world.roadChunks = createRoadChunkState({ fetchRadiusMeters: 300 });
  state.world.roadChunks.loaded = extended ? ['0:0', '1:0'] : ['0:0'];
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.worldTimeMs = 100000;
  state.runtime.combatInitialized = true;
  return state;
}

test('dead-end roads at unexplored chunk borders become frontier candidates', () => {
  const state = stateForFrontier(false);
  const candidates = findFrontierCandidates(state);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].nodeId, 'edge');
  assert.equal(candidates[0].directionKey, 'E');
});

test('frontier source stays fixed while its entry point advances with map expansion', () => {
  const state = stateForFrontier(false);
  reconcileFrontiers(state);
  assert.equal(state.world.frontierSources.length, 1);
  const sourceId = state.world.frontierSources[0].id;
  const sourcePoint = { ...state.world.frontierSources[0].point };
  assert.equal(state.world.frontierSources[0].entryNodeId, 'edge');

  state.world.roadGraph = makeGraph(true);
  state.world.roadChunks.loaded = ['0:0', '1:0'];
  reconcileFrontiers(state);
  const source = state.world.frontierSources.find(item => item.id === sourceId);
  assert.deepEqual(source.point, sourcePoint);
  assert.equal(source.entryNodeId, 'next-edge');
});

test('frontier system launches enemies from a map-edge entry node', () => {
  const state = stateForFrontier(false);
  const messages = [];
  const system = new FrontierSystem({ emit(type, payload) { if (type === 'message') messages.push(payload.text); } });
  system.reconcile(state);
  const source = state.world.frontierSources[0];
  source.spawnClock = source.spawnIntervalSec;
  system.update(state, 0.1);
  assert.ok(state.combat.enemies.length >= 2);
  assert.ok(state.combat.enemies.every(enemy => enemy.nodeId === source.entryNodeId));
  assert.ok(state.combat.enemies.every(enemy => enemy.sourceBaseId === source.id));
  assert.ok(messages.some(message => message.includes('未確認前線')));
});

test('frontier identity is hidden until the signal is localized', () => {
  const hidden = frontierPresentation({ profile: 'siege', signalStage: 'DISTANT', threat: 3, status: 'UNCONFIRMED' });
  assert.equal(hidden.profileLabel, '不明');
  const visible = frontierPresentation({ profile: 'siege', signalStage: 'LOCATED', threat: 3, status: 'LOCATED' });
  assert.equal(visible.profileLabel, '攻城部隊');
});

test('frontier renderer tolerates a minimal canvas context', () => {
  const state = stateForFrontier(false);
  reconcileFrontiers(state);
  const calls = [];
  const context = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); }, arc() {}, setLineDash() {}, closePath() {}, fillText() {},
    set lineCap(value) {}, set lineJoin(value) {}, set strokeStyle(value) {}, set fillStyle(value) {},
    set lineWidth(value) {}, set font(value) {}
  };
  const camera = { viewportWidth: 800, viewportHeight: 600, worldToScreen(point) { return { x: 400 + point.x * 0.2, y: 300 + point.y * 0.2 }; } };
  drawFrontierSignals(context, state, camera, 1000, { quality: 'balanced' });
  assert.ok(calls.includes('stroke'));
  assert.ok(calls.includes('fill'));
});
