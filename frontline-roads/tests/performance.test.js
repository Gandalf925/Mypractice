import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceProfile } from '../src/app/performance-profile.js';
import { GameLoop } from '../src/app/game-loop.js';
import { buildCombatSpatialIndex } from '../src/combat/combat-spatial-index.js';
import { Renderer } from '../src/rendering/renderer.js';
import { Camera } from '../src/rendering/camera.js';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { buildFriendlyRouteOptions } from '../src/combat/friendly-route-planner.js';

function runtimeState() {
  return { runtime: { worldTimeMs: 0, lastSavedAt: 0, performance: { frames: 0, slowFrames: 0, lastFrameMs: 0 } } };
}

test('balanced profile limits simulation, rendering and DPR', () => {
  const profile = performanceProfile('balanced');
  assert.equal(profile.renderHz, 24);
  assert.equal(profile.simulationHz, 20);
  assert.equal(profile.maxDpr, 1);
  assert.ok(performanceProfile('minimal').renderHz < profile.renderHz);
});

test('game loop decouples simulation, civilization and rendering rates', () => {
  const state = runtimeState();
  let combatUpdates = 0;
  let civilizationUpdates = 0;
  let renders = 0;
  let uiUpdates = 0;
  const store = {
    mutate(mutator) { mutator(state); },
    getState() { return structuredClone(state); }
  };
  const loop = new GameLoop({
    store,
    combatSystem: { update() { combatUpdates += 1; } },
    civilizationSystem: { update() { civilizationUpdates += 1; } },
    renderer: { render() { renders += 1; } },
    saveRepository: { isAvailable: () => false },
    onUiUpdate: () => { uiUpdates += 1; },
    getPerformanceProfile: () => performanceProfile('balanced')
  });
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  loop.running = true;
  loop.lastTime = 0;
  for (let frame = 1; frame <= 60; frame += 1) loop.frame(frame * (1000 / 60));
  loop.running = false;
  globalThis.requestAnimationFrame = previousRaf;
  assert.ok(combatUpdates >= 19 && combatUpdates <= 21, `combat=${combatUpdates}`);
  assert.ok(civilizationUpdates >= 3 && civilizationUpdates <= 4, `civilization=${civilizationUpdates}`);
  assert.ok(renders >= 23 && renders <= 25, `renders=${renders}`);
  assert.ok(uiUpdates >= 1 && uiUpdates <= 2, `ui=${uiUpdates}`);
});

test('combat spatial index returns only nearby active enemies', () => {
  const graph = {
    nodeById: new Map([['a', { x: 0, y: 0 }], ['b', { x: 100, y: 0 }]]),
    edgeById: new Map([['e', { id: 'e', a: 'a', b: 'b', length: 100 }]])
  };
  const enemy = (id, progress, hp = 10) => ({ id, hp, departDelay: 0, nodeId: 'a', edgeId: 'e', edgeProgress: progress, pathIndex: 0, path: { nodeIds: ['a', 'b'], edgeIds: ['e'] }, type: 'infantry' });
  const state = { world: { roadGraph: graph }, combat: { enemies: [enemy('near', 10), enemy('far', 90), enemy('dead', 12, 0)] } };
  const index = buildCombatSpatialIndex(state, 20);
  assert.deepEqual(index.query({ x: 10, y: 0 }, 15).map(entry => entry.enemy.id), ['near']);
});

class MockContext {
  constructor() { this.ops = 0; }
  save(){this.ops++} restore(){this.ops++} beginPath(){this.ops++} closePath(){this.ops++}
  moveTo(){this.ops++} lineTo(){this.ops++} arc(){this.ops++} stroke(){this.ops++} fill(){this.ops++}
  fillRect(){this.ops++} strokeRect(){this.ops++} translate(){this.ops++} rotate(){this.ops++}
  fillText(){this.ops++} setLineDash(){this.ops++} clearRect(){this.ops++} drawImage(){this.ops++} setTransform(){this.ops++}
  createRadialGradient(){this.ops++; return { addColorStop: () => { this.ops++; } };}
  set fillStyle(value){this.ops++} set strokeStyle(value){this.ops++} set lineWidth(value){this.ops++}
  set shadowColor(value){this.ops++} set shadowBlur(value){this.ops++} set globalCompositeOperation(value){this.ops++}
  set globalAlpha(value){this.ops++} set lineCap(value){this.ops++} set lineJoin(value){this.ops++}
  set font(value){this.ops++} set textAlign(value){this.ops++} set textBaseline(value){this.ops++}
}

function mockLayer() {
  const context = new MockContext();
  return { width: 1, height: 1, context, getContext: () => context };
}

test('renderer caches static radar and road layers between frames', () => {
  const main = new MockContext();
  const documentRef = { createElement: () => mockLayer() };
  const canvas = {
    ownerDocument: documentRef,
    width: 1,
    height: 1,
    getContext: () => main,
    getBoundingClientRect: () => ({ width: 390, height: 844 })
  };
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => null;
  const camera = new Camera();
  const renderer = new Renderer(canvas, camera);
  const a = { id: 'a', x: 0, y: 0 };
  const b = { id: 'b', x: 100, y: 0 };
  const graph = { nodes: [a, b], edges: [{ id: 'e', a: 'a', b: 'b', roadWidth: 6 }], nodeById: new Map([['a', a], ['b', b]]) };
  renderer.setGraph(graph);
  renderer.setStateProvider(() => ({ lifecycle: 'BASE_SELECTION', world: { roadGraph: graph } }));
  renderer.render(0);
  const staticOps = renderer.backgroundContext.ops;
  renderer.render(33);
  assert.equal(renderer.backgroundContext.ops, staticOps);
  renderer.destroy();
  globalThis.requestAnimationFrame = previousRaf;
});


test('tactical route choices use spatial snapshots instead of rescanning every enemy and defense per road edge', () => {
  const size = 50;
  const spacing = 30;
  const nodes = [];
  const edges = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) nodes.push({ id: `n${row}_${column}`, x: column * spacing, y: row * spacing });
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (column < size - 1) edges.push({ id: `h${row}_${column}`, a: `n${row}_${column}`, b: `n${row}_${column + 1}`, length: spacing });
      if (row < size - 1) edges.push({ id: `v${row}_${column}`, a: `n${row}_${column}`, b: `n${row + 1}_${column}`, length: spacing });
    }
  }
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'performance-test', roadSpecVersion: 4, nodes, edges });
  state.world.playerBases = [{ id: 'home-base', name: '本拠地', status: 'ESTABLISHED', nodeId: 'n0_0', x: 0, y: 0, hp: 100, maxHp: 100 }];
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: `n${size - 1}_${size - 1}`, alive: true, hp: 100, maxHp: 100 }];
  const enemies = Array.from({ length: 150 }, (_, index) => ({
    id: `enemy-${index}`, type: 'infantry', level: 1, hp: 50, maxHp: 50,
    nodeId: `n${(index * 17) % size}_${(index * 31) % size}`, edgeId: null, path: null, pathIndex: 0, edgeProgress: 0, departDelay: 0
  }));
  const defenses = Array.from({ length: 150 }, (_, index) => ({
    id: `defense-${index}`, type: 'gun', kind: 'tower', nodeId: `n${(index * 13) % size}_${(index * 29) % size}`,
    hp: 100, maxHp: 100, range: 80, ruined: false
  }));
  let enemyScans = 0;
  let defenseScans = 0;
  state.combat.enemies = new Proxy(enemies, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) return function* iterator() { enemyScans += 1; yield* target; };
      return Reflect.get(target, property, receiver);
    }
  });
  state.combat.defenses = new Proxy(defenses, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) return function* iterator() { defenseScans += 1; yield* target; };
      return Reflect.get(target, property, receiver);
    }
  });
  const squad = { id: 'squad', type: 'assault', hp: 180, maxHp: 180, nodeId: `n${size / 2}_${size / 2}`, edgeId: null, edgeProgress: 0, pathIndex: 0, path: null };
  const options = buildFriendlyRouteOptions(state, squad, 'n0_0');
  assert.equal(options.length, 3);
  assert.ok(enemyScans <= 2, `enemy collection was rescanned ${enemyScans} times`);
  assert.ok(defenseScans <= 2, `defense collection was rescanned ${defenseScans} times`);
});
