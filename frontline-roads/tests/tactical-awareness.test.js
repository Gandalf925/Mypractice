import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeThreat, remainingRouteDistance } from '../src/rendering/threat-analysis.js';

function stateWithEnemy({ edgeLength = 100, progress = 20, cityHp = 100, count = 1 } = {}) {
  const edge = { id: 'e1', a: 'a', b: 'city', length: edgeLength };
  const graph = {
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'city', x: 100, y: 0 }],
    edges: [edge],
    nodeById: new Map([['a', { id: 'a', x: 0, y: 0 }], ['city', { id: 'city', x: 100, y: 0 }]]),
    edgeById: new Map([['e1', edge]])
  };
  const enemy = index => ({ id: `enemy-${index}`, type: 'infantry', hp: 50, maxHp: 50, nodeId: 'a', path: { nodeIds: ['a', 'city'], edgeIds: ['e1'], targetId: 'city' }, pathIndex: 0, edgeId: 'e1', edgeProgress: progress, departDelay: 0, slowTimer: 0 });
  return { world: { roadGraph: graph, city: { nodeId: 'city', hp: cityHp, maxHp: 100 } }, combat: { enemies: Array.from({ length: count }, (_, i) => enemy(i)) } };
}

test('remaining route distance accounts for current edge progress', () => {
  const state = stateWithEnemy({ edgeLength: 100, progress: 25 });
  assert.equal(remainingRouteDistance(state, state.combat.enemies[0]), 75);
});

test('threat level escalates from contact to critical', () => {
  assert.equal(analyzeThreat(stateWithEnemy({ progress: 0, count: 1 })).label, 'ENGAGED');
  assert.equal(analyzeThreat(stateWithEnemy({ progress: 80, count: 1 })).label, 'CRITICAL');
  assert.equal(analyzeThreat(stateWithEnemy({ cityHp: 20, progress: 0, count: 1 })).label, 'CRITICAL');
});

test('clear threat reports stable defense line', () => {
  const state = stateWithEnemy({ count: 0 });
  const result = analyzeThreat(state);
  assert.equal(result.label, 'CLEAR');
  assert.match(result.detail, /接触なし/);
});

function mockContext() {
  return {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, fill() {},
    translate() {}, rotate() {}, fillText() {}, setLineDash() {},
    set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set shadowColor(value) {}, set shadowBlur(value) {},
    set globalCompositeOperation(value) {}, set globalAlpha(value) {}, set font(value) {}, set textAlign(value) {}
  };
}

test('tactical routes and focus render with a minimal canvas context', async () => {
  const { drawThreatRoutes, drawTacticalFocus } = await import('../src/rendering/tactical-overlay.js');
  const state = stateWithEnemy({ progress: 20, count: 1 });
  state.combat.defenses = [];
  state.world.enemyBases = [];
  state.world.outposts = [];
  const camera = { scale: 1, worldToScreen: point => point };
  const context = mockContext();
  assert.doesNotThrow(() => drawThreatRoutes(context, state, camera, { kind: 'enemy', id: 'enemy-0' }));
  assert.doesNotThrow(() => drawTacticalFocus(context, state, camera, { kind: 'enemy', id: 'enemy-0' }, 1000));
});
