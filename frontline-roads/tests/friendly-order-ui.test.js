import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { dispatchAssaultSquad } from '../src/combat/friendly-force-system.js';
import { drawFriendlyOrderPlanning } from '../src/rendering/friendly-order-overlay.js';

function mockContext() {
  return {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, fill() {}, fillText() {}, setLineDash() {},
    set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set globalCompositeOperation(value) {}, set font(value) {}, set textAlign(value) {}
  };
}

function stateFixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'cross', x: 100, y: 0 }, { id: 'enemy', x: 200, y: 0 }],
    edges: [{ id: 'one', a: 'home', b: 'cross', length: 100 }, { id: 'two', a: 'cross', b: 'enemy', length: 100 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true }];
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'cross';
  squad.path = { nodeIds: ['cross', 'enemy'], edgeIds: ['two'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  return { state, squad };
}

test('friendly order overlay draws selectable nodes, routes, destination and waypoints on a minimal canvas', () => {
  const { state, squad } = stateFixture();
  const camera = { viewportWidth: 390, viewportHeight: 844, worldToScreen: point => ({ x: point.x + 80, y: point.y + 100 }) };
  const planning = {
    squadId: squad.id,
    mode: 'RETREAT',
    destinationNodeId: 'home',
    waypointNodeIds: ['cross'],
    selectedRouteIndex: 0,
    routes: [{ label: '最短', path: { nodeIds: ['cross', 'home'], edgeIds: ['one'] } }]
  };
  assert.doesNotThrow(() => drawFriendlyOrderPlanning(mockContext(), state, camera, planning, 1000));
});

test('combat UI exposes stop, retreat, withdraw, resume and two-waypoint route planning', async () => {
  const source = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  assert.match(source, /'停止'/);
  assert.match(source, /'後退'/);
  assert.match(source, /'撤退'/);
  assert.match(source, /'移動再開'/);
  assert.match(source, /waypointNodeIds\.length >= 2/);
  assert.match(source, /confirmOrderPlanning/);
  assert.match(source, /friendlyRouteIndexAtPoint/);
});

test('renderer places squad order guidance above combat and construction layers', async () => {
  const source = await readFile(new URL('../src/rendering/renderer.js', import.meta.url), 'utf8');
  const effects = source.indexOf('this.effects.draw');
  const build = source.lastIndexOf('drawBuildPlacement');
  const orders = source.lastIndexOf('drawFriendlyOrderPlanning');
  assert.ok(effects >= 0 && build > effects && orders > build);
});
