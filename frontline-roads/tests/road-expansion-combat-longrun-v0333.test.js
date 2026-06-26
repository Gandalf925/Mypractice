import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes, reachableRoadNodeIds } from '../src/roads/road-graph.js';
import { mergeRoadGraphs } from '../src/roads/graph-merge.js';
import { createRoadChunkState, graphCoveredChunkIds } from '../src/roads/world-chunk-grid.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { reconcileActiveWaveRecords } from '../src/combat/wave-system.js';

function lineGraph(startIndex, endIndex, { includeStart = true } = {}) {
  const nodes = [];
  const edges = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (includeStart || index !== startIndex) nodes.push({ id: `n${index}`, x: index * 60, y: 0 });
    if (index > startIndex) {
      edges.push({
        id: `e${index - 1}-${index}`,
        a: `n${index - 1}`,
        b: `n${index}`,
        length: 60,
        roadWidth: 5,
        lanes: 1,
        highway: 'residential',
        name: '',
        oneway: false
      });
    }
  }
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 },
    source: 'longrun-road',
    roadSpecVersion: 3,
    nodes,
    edges
  });
}

function liveWaveCounts(state) {
  const counts = new Map();
  for (const enemy of state.combat.enemies) {
    if (enemy.hp <= 0 || enemy.waveResolved || !enemy.waveId) continue;
    counts.set(enemy.waveId, (counts.get(enemy.waveId) ?? 0) + 1);
  }
  return counts;
}

test('ten-minute combat remains coherent while the player road network expands twice', () => {
  const state = createInitialState();
  state.world.roadGraph = lineGraph(0, 30);
  const initialChunks = graphCoveredChunkIds(state.world.roadGraph);
  state.world.roadChunks = createRoadChunkState({
    initialLoadedChunkIds: initialChunks,
    initialIntegratedChunkIds: initialChunks,
    initialObservedChunkIds: initialChunks
  });
  state.world.homeBase = {
    id: 'home-base', status: 'ESTABLISHED', nodeId: 'n0', x: 0, y: 0,
    selectedDistanceMeters: 0
  };
  state.runtime.createdAt = 1;
  state.runtime.worldTimeMs = 1;
  initializeCombatState(state);

  const events = [];
  const combat = new CombatSystem({ emit(type, payload) { events.push({ type, payload }); } });
  let peakMovingEnemies = 0;

  for (let second = 1; second <= 600; second += 1) {
    if (second === 120) {
      mergeRoadGraphs(state.world.roadGraph, lineGraph(30, 45), { chunkId: '3:0' });
      state.world.roadChunks.loaded.push('3:0');
      state.world.roadChunks.integrated.push('3:0');
      state.player.worldPosition = { x: 44 * 60, y: 0 };
    }
    if (second === 300) {
      mergeRoadGraphs(state.world.roadGraph, lineGraph(45, 60), { chunkId: '5:0' });
      state.world.roadChunks.loaded.push('5:0');
      state.world.roadChunks.integrated.push('5:0');
      state.player.worldPosition = { x: 59 * 60, y: 0 };
    }
    state.runtime.worldTimeMs += 1000;
    combat.update(state, 1);
    const moving = state.combat.enemies.filter(enemy => enemy.hasDeparted || enemy.edgeId || enemy.edgeProgress > 0).length;
    peakMovingEnemies = Math.max(peakMovingEnemies, moving);
  }

  reconcileActiveWaveRecords(state);
  const counts = liveWaveCounts(state);
  for (const [waveId, record] of Object.entries(state.combat.waves.active)) {
    assert.equal(record.remaining, counts.get(waveId) ?? 0);
  }
  for (const waveId of counts.keys()) assert.ok(state.combat.waves.active[waveId]);

  const settlements = [state.world.city.nodeId, ...state.world.playerBases.filter(base => base.hp > 0).map(base => base.nodeId)];
  const reachable = reachableRoadNodeIds(state.world.roadGraph, settlements);
  assert.equal(reachable.has('n60'), true);
  assert.ok(state.world.roadGraph.topologyRevision >= 3);
  assert.ok(peakMovingEnemies > 0);
  assert.ok(state.world.enemyBases.some(base => base.wavesSent > 0));
  assert.equal(events.some(event => event.type === 'combat:enemy-route-abandoned'), false);
  assert.ok(state.combat.enemies.every(enemy => enemy.routeFailureSeconds < 45 || !reachable.has(enemy.nodeId)));
  assert.ok((state.world.frontierSources ?? []).filter(source => source.status !== 'CLEARED').every(source => !source.entryNodeId || reachable.has(source.entryNodeId)));
});
