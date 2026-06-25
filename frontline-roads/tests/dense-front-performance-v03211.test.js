import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { EventBus } from '../src/core/event-bus.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  ENEMY_DENSITY_BY_CIVILIZATION,
  enemyDensityForState,
  enemyPopulationCap,
  expandedWaveSize
} from '../src/combat/enemy-scaling.js';
import { spawnEnemy } from '../src/combat/enemy-system.js';
import { Renderer } from '../src/rendering/renderer.js';
import { Camera } from '../src/rendering/camera.js';
import { RoadWorldManager } from '../src/roads/road-world-manager.js';

function graphFixture() {
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'performance-test', roadSpecVersion: 4,
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 200, y: 0 }],
    edges: [{ id: 'road', a: 'a', b: 'b', length: 200, roadWidth: 6 }]
  });
}

function stateFixture(level = 0) {
  const state = createInitialState();
  state.lifecycle = 'PLAYING';
  state.civilization.level = level;
  state.world.roadGraph = graphFixture();
  state.world.homeBase = { id: 'home', status: 'ESTABLISHED', nodeId: 'a', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', kind: 'MAJOR', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'a', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  return state;
}

function enemyFixture(index) {
  return {
    id: `enemy-${index}`, type: 'infantry', level: 1, hp: 80, maxHp: 80, radius: 4.5,
    nodeId: 'a', path: { nodeIds: ['a', 'b'], edgeIds: ['road'], targetId: 'b' }, pathIndex: 0,
    edgeId: 'road', edgeProgress: (index % 100) * 2, slowTimer: index % 17 === 0 ? 2 : 0,
    slowMultiplier: 0.52, attackClock: 0, departDelay: 0, sourceBaseId: 'base', waveId: null,
    waveResolved: false, rewardGranted: false, reroutePending: false, routeBias: 1,
    targetDefenseId: null, targetFieldBaseId: null, targetPlayerBaseId: null, targetSquadId: null,
    notifiedDefenseIds: [], engagedSquadId: null
  };
}

test('enemy density rises by civilization level while the opening generation stays unchanged', () => {
  const expectedCaps = [220, 320, 440, 580, 720];
  const expectedWaveSizes = [4, 6, 9, 13, 18];
  for (let level = 0; level <= 4; level += 1) {
    const state = stateFixture(level);
    assert.equal(enemyPopulationCap(state), expectedCaps[level]);
    assert.equal(expandedWaveSize(state, 4), expectedWaveSizes[level]);
    assert.equal(enemyDensityForState(state), ENEMY_DENSITY_BY_CIVILIZATION[level]);
  }
});

test('civilization grace period delays the new density tier until the generation is active', () => {
  const state = stateFixture(4);
  state.runtime.worldTimeMs = 1_000_000;
  state.civilization.gracePeriodUntil = state.runtime.worldTimeMs + 60_000;
  assert.equal(enemyPopulationCap(state), ENEMY_DENSITY_BY_CIVILIZATION[3].populationCap);
  state.runtime.worldTimeMs = state.civilization.gracePeriodUntil;
  assert.equal(enemyPopulationCap(state), ENEMY_DENSITY_BY_CIVILIZATION[4].populationCap);
});

test('enemy spawning respects the civilization-specific population cap and the hard ceiling', () => {
  const state = stateFixture(2);
  const base = { id: 'base', nodeId: 'b', level: 1, wavesSent: 0 };
  for (let index = 0; index < 800; index += 1) spawnEnemy(state, base, 'infantry');
  assert.equal(state.combat.enemies.length, ENEMY_DENSITY_BY_CIVILIZATION[2].populationCap);
});

test('UI snapshots reuse the detached road graph while refreshing mutable gameplay data', () => {
  const store = new StateStore(stateFixture(1), new EventBus());
  const first = store.uiSnapshot();
  const second = store.uiSnapshot();
  assert.notEqual(first, second);
  assert.equal(first.world.roadGraph, second.world.roadGraph);
  assert.notEqual(first.world.roadGraph, store.renderView().world.roadGraph);
  store.advance(state => { state.inventory.resources.wood = 77; });
  const third = store.uiSnapshot();
  assert.equal(third.inventory.resources.wood, 77);
  assert.equal(third.world.roadGraph, first.world.roadGraph);
  store.transaction(state => { state.world.roadGraph.nodes[0].x = 5; });
  const fourth = store.uiSnapshot();
  assert.notEqual(fourth.world.roadGraph, first.world.roadGraph);
  assert.equal(fourth.world.roadGraph.nodeById.get('a').x, 5);
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

test('balanced rendering reuses the combat layer until simulation state changes', () => {
  const main = new MockContext();
  const layers = [];
  const canvas = {
    ownerDocument: { createElement() { const layer = mockLayer(); layers.push(layer); return layer; } },
    width: 1, height: 1, getContext: () => main,
    getBoundingClientRect: () => ({ width: 390, height: 844 })
  };
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => null;
  try {
    const state = stateFixture(4);
    state.combat.enemies = Array.from({ length: 500 }, (_, index) => enemyFixture(index));
    const camera = new Camera();
    camera.x = 100; camera.y = 0; camera.scale = 1;
    const renderer = new Renderer(canvas, camera);
    renderer.setGraph(state.world.roadGraph);
    renderer.setStateProvider(() => state);
    renderer.render(100);
    const firstOps = renderer.combatContext.ops;
    assert.ok(firstOps > 0);
    renderer.render(130);
    assert.equal(renderer.combatContext.ops, firstOps);
    state.runtime.worldTimeMs += 50;
    state.runtime.updatedAt += 1;
    renderer.render(160);
    assert.ok(renderer.combatContext.ops > firstOps);
    renderer.destroy();
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
  }
});

test('automatic survey polling does not clone or transact the full world every HUD refresh', () => {
  let now = 100_000;
  let reads = 0;
  let transactions = 0;
  const manager = new RoadWorldManager({
    store: {
      read(selector) { reads += 1; return selector({ combat: { defenses: [] } }); },
      transaction() { transactions += 1; }
    },
    roadService: {}, cache: null, now: () => now
  });
  assert.deepEqual(manager.considerSurveyFacilities(), []);
  assert.equal(reads, 1);
  assert.equal(transactions, 0);
  now += 500;
  assert.deepEqual(manager.considerSurveyFacilities(), []);
  assert.equal(reads, 1);
  now += 29_500;
  assert.deepEqual(manager.considerSurveyFacilities(), []);
  assert.equal(reads, 2);
  assert.equal(transactions, 0);
});
