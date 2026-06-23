import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes, graphElementsInBounds } from '../src/roads/road-graph.js';
import {
  REGION_ACTIVITY,
  consumeRegionalSimulationTime,
  regionActivityAtPoint
} from '../src/combat/region-activity.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function regionalState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'city', x: 0, y: 0 },
      { id: 'active', x: 100, y: 0 },
      { id: 'remote', x: 3000, y: 0 }
    ],
    edges: [
      { id: 'active-road', a: 'city', b: 'active', length: 100, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false },
      { id: 'remote-road', a: 'active', b: 'remote', length: 2900, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'city', x: 0, y: 0 };
  state.world.city = { nodeId: 'city', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  state.combat.enemies = [{
    id: 'remote-enemy', type: 'infantry', hp: 70, maxHp: 70, nodeId: 'remote',
    path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0,
    sourceBaseId: null, waveId: null, waveResolved: false, rewardGranted: false,
    reroutePending: false, routeBias: 1, targetDefenseId: null, notifiedDefenseIds: []
  }];
  state.combat.defenses = [{
    id: 'remote-gun', kind: 'tower', type: 'gun', line: 'single', tier: 0, defenseKey: 'single0',
    nodeId: 'remote', hp: 150, maxHp: 150, cooldown: 0, disabledTimer: 0, ruined: false
  }];
  return state;
}

test('region activity follows the nearest city or player anchor', () => {
  const state = regionalState();
  assert.equal(regionActivityAtPoint(state, { x: 400, y: 0 }), REGION_ACTIVITY.ACTIVE);
  assert.equal(regionActivityAtPoint(state, { x: 1500, y: 0 }), REGION_ACTIVITY.PERIPHERAL);
  assert.equal(regionActivityAtPoint(state, { x: 3000, y: 0 }), REGION_ACTIVITY.DORMANT);
  state.player.worldPosition = { x: 2900, y: 0 };
  assert.equal(regionActivityAtPoint(state, { x: 3000, y: 0 }), REGION_ACTIVITY.ACTIVE);
});

test('regional clocks only release peripheral and dormant simulation at their intervals', () => {
  const state = regionalState();
  const first = consumeRegionalSimulationTime(state, 1);
  assert.deepEqual(first, { active: 1, peripheral: 0, dormant: 0 });
  const second = consumeRegionalSimulationTime(state, 1);
  assert.deepEqual(second, { active: 1, peripheral: 2, dormant: 0 });
  for (let index = 0; index < 6; index += 1) consumeRegionalSimulationTime(state, 1);
  assert.equal(state.runtime.regionalSimulation.dormantAccumulator, 0);
});

test('dormant enemies and facilities advance only when the remote interval is due', () => {
  const state = regionalState();
  const combat = new CombatSystem(null);
  for (let index = 0; index < 7; index += 1) combat.update(state, 1);
  assert.equal(state.combat.enemies[0].hp, 70);
  assert.equal(state.combat.enemies[0].edgeProgress, 0);
  combat.update(state, 1);
  assert.ok(state.combat.enemies.length === 0 || state.combat.enemies[0].hp < 70 || state.combat.enemies[0].edgeProgress > 0);
});

test('road graph spatial index excludes distant roads from local queries', () => {
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }];
  const edges = [{ id: 'near', a: 'a', b: 'b', length: 100, roadWidth: 5 }];
  for (let index = 0; index < 80; index += 1) {
    const x = 5000 + index * 100;
    nodes.push({ id: `f${index}a`, x, y: 0 }, { id: `f${index}b`, x: x + 50, y: 0 });
    edges.push({ id: `far${index}`, a: `f${index}a`, b: `f${index}b`, length: 50, roadWidth: 5 });
  }
  const graph = attachGraphIndexes({ nodes, edges, center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2 });
  const local = graphElementsInBounds(graph, { minX: -200, minY: -200, maxX: 200, maxY: 200 });
  assert.deepEqual(local.edges.map(edge => edge.id), ['near']);
  assert.equal(local.nodes.length, 2);
});

test('expanded road graphs use compact save encoding and restore gameplay fields', () => {
  const state = regionalState();
  for (let index = 0; index < 120; index += 1) {
    state.world.roadGraph.nodes.push({ id: `n${index}`, x: index * 10, y: 500 });
    if (index > 0) state.world.roadGraph.edges.push({
      id: `e${index}`, a: `n${index - 1}`, b: `n${index}`, length: 10,
      roadWidth: 5, lanes: 1, highway: 'residential', name: `road-${index}`, oneway: false,
      points: [{ x: (index - 1) * 10, y: 500 }, { x: index * 10, y: 500 }], chunkIds: ['1:0']
    });
  }
  attachGraphIndexes(state.world.roadGraph);
  const ordinaryBytes = new TextEncoder().encode(JSON.stringify(state)).length;
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'world');
  repository.save(state);
  const raw = storage.getItem('world');
  const saved = JSON.parse(raw);
  assert.equal(saved.world.roadGraph.format, 'frontline-road-graph-1');
  assert.ok(new TextEncoder().encode(raw).length < ordinaryBytes * 0.8);
  const restored = repository.load();
  assert.equal(restored.world.roadGraph.edges.length, state.world.roadGraph.edges.length);
  assert.equal(restored.world.roadGraph.edges.at(-1).name, 'road-119');
  assert.equal(restored.world.roadGraph.edges.at(-1).points, undefined);
});
