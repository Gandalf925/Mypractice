import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { buildRoadGraphFromSegments, attachGraphIndexes } from '../src/roads/road-graph.js';
import { repairRoadGraphTopology } from '../src/roads/road-topology-repair.js';
import { mergeRoadGraphs } from '../src/roads/graph-merge.js';
import { encodeRoadGraph, decodeRoadGraph } from '../src/persistence/road-graph-codec.js';
import { activeFriendlyBarrierEdgeIds, findFriendlyRoadPath } from '../src/combat/routing-system.js';
import { buildDeploymentRouteOptions, FRIENDLY_ORDER_MODE } from '../src/combat/friendly-route-planner.js';
import { CombatUi } from '../src/ui/combat-ui.js';
import { dispatchFriendlySquad, previewFriendlyDeployment, FriendlyForceSystem } from '../src/combat/friendly-force-system.js';

function segment(id, wayId, sourceNodeA, sourceNodeB, a, b, elevation = {}) {
  return {
    id, wayId, sourceNodeA, sourceNodeB, a, b,
    roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false,
    layer: elevation.layer ?? 0, bridge: elevation.bridge ?? false, tunnel: elevation.tunnel ?? false
  };
}

function edge(id, a, b, length, extra = {}) {
  return { id, a, b, length, roadWidth: 5, lanes: 1, highway: 'residential', name: '', oneway: false, ...extra };
}

function deploymentState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [
      { id: 'home', x: 0, y: 0 }, { id: 'fork', x: 80, y: 0 },
      { id: 'upper', x: 150, y: 55 }, { id: 'lower', x: 150, y: -90 },
      { id: 'join', x: 220, y: 0 }, { id: 'enemy', x: 300, y: 0 }
    ],
    edges: [
      edge('home-fork', 'home', 'fork', 80),
      edge('fork-upper', 'fork', 'upper', 89), edge('upper-join', 'upper', 'join', 89),
      edge('fork-lower', 'fork', 'lower', 114), edge('lower-join', 'lower', 'join', 114),
      edge('join-enemy', 'join', 'enemy', 80)
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1 }];
  state.runtime.combatInitialized = true;
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('shared OSM portal remains connected when bridge metadata changes at the node', () => {
  const graph = buildRoadGraphFromSegments([
    segment('ground', 'way-ground', 'g0', 'portal', { x: -100, y: 0 }, { x: 0, y: 0 }),
    segment('bridge', 'way-bridge', 'portal', 'b1', { x: 0, y: 0 }, { x: 100, y: 0 }, { layer: 1, bridge: true })
  ], { lat: 35, lon: 139 });
  assert.equal(graph.nodes.length, 3);
  const path = findFriendlyRoadPath({ world: { roadGraph: graph }, combat: { defenses: [] } }, graph.nodes.find(node => node.sourceNodeIds.includes('g0')).id, graph.nodes.find(node => node.sourceNodeIds.includes('b1')).id);
  assert.ok(path);
  assert.equal(path.edgeIds.length, 2);
});

test('terminal-to-road repair creates a real T junction without changing elevation-separated roads', () => {
  const graph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [
      { id: 'left', x: -60, y: 0 }, { id: 'right', x: 60, y: 0 },
      { id: 'tip', x: 0, y: 4 }, { id: 'north', x: 0, y: 60 },
      { id: 'bridge-a', x: -60, y: 2 }, { id: 'bridge-b', x: 60, y: 2 }
    ],
    edges: [
      edge('main', 'left', 'right', 120, { layer: 0 }),
      edge('branch', 'tip', 'north', 56, { layer: 0 }),
      edge('bridge', 'bridge-a', 'bridge-b', 120, { layer: 1, bridge: true })
    ]
  });
  const result = repairRoadGraphTopology(graph);
  assert.equal(result.changed, true);
  assert.ok(result.splitEdges >= 2);
  assert.ok(findFriendlyRoadPath({ world: { roadGraph: graph }, combat: { defenses: [] } }, 'north', 'left'));
  assert.equal(graph.adjacency.get('bridge-a').some(connection => connection.to === 'tip'), false);
});

test('chunk merge joins exact OSM nodes across differing bridge metadata', () => {
  const base = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'left', x: -100, y: 0, sourceNodeIds: ['left'] }, { id: 'portal-a', x: 0, y: 0, sourceNodeIds: ['portal'], elevationKeys: ['0:0:0'] }],
    edges: [edge('left-edge', 'left', 'portal-a', 100, { sourceWayIds: ['ground'], layer: 0 })]
  });
  const incoming = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'portal-b', x: 0.2, y: 0.1, sourceNodeIds: ['portal'], elevationKeys: ['1:1:0'] }, { id: 'right', x: 100, y: 0, sourceNodeIds: ['right'] }],
    edges: [edge('right-edge', 'portal-b', 'right', 100, { sourceWayIds: ['bridge'], layer: 1, bridge: true })]
  });
  mergeRoadGraphs(base, incoming, { chunkId: '1:0' });
  const portalNodes = base.nodes.filter(node => node.sourceNodeIds?.includes('portal'));
  assert.equal(portalNodes.length, 1);
  assert.ok(findFriendlyRoadPath({ world: { roadGraph: base }, combat: { defenses: [] } }, 'left', 'right'));
});

test('compact road save preserves elevation and topology repair metadata', () => {
  const graph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4, topologyRevision: 7,
    nodes: [{ id: 'a', x: 0, y: 0, sourceNodeIds: ['1'], elevationKeys: ['1:1:0'] }, { id: 'b', x: 10, y: 0 }],
    edges: [edge('parent', 'a', 'b', 10, { layer: 1, bridge: true, routingDisabled: true, subdivisionEdgeIds: ['child'] }), edge('child', 'a', 'b', 10, { layer: 1, bridge: true, parentEdgeId: 'parent', ancestorEdgeIds: ['parent'], topologyRepair: 'terminal-to-road' })]
  });
  const encoded = encodeRoadGraph(graph);
  assert.equal(encoded.format, 'frontline-road-graph-3');
  const restored = attachGraphIndexes(decodeRoadGraph(encoded));
  assert.equal(restored.edgeById.get('parent').routingDisabled, true);
  assert.equal(restored.edgeById.get('child').bridge, true);
  assert.deepEqual(restored.edgeById.get('child').ancestorEdgeIds, ['parent']);
  assert.deepEqual(restored.nodeById.get('a').elevationKeys, ['1:1:0']);
});

test('a wall on a repaired parent edge blocks every routing subdivision', () => {
  const graph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'left', x: -60, y: 0 }, { id: 'right', x: 60, y: 0 }, { id: 'tip', x: 0, y: 4 }, { id: 'north', x: 0, y: 60 }],
    edges: [edge('main', 'left', 'right', 120), edge('branch', 'tip', 'north', 56)]
  });
  repairRoadGraphTopology(graph);
  const state = { world: { roadGraph: graph }, combat: { defenses: [{ id: 'wall', kind: 'barrier', edgeId: 'main', hp: 100, isGate: false }] } };
  const blocked = activeFriendlyBarrierEdgeIds(state);
  assert.ok(blocked.size >= 2);
  assert.equal(findFriendlyRoadPath(state, 'left', 'right'), null);
});

test('deployment route options expose alternatives and dispatch follows the selected first edge', () => {
  const state = deploymentState();
  const routes = buildDeploymentRouteOptions(state, 'assault', 'home', 'enemy', ['lower']);
  assert.ok(routes.length >= 1);
  const selected = routes[0];
  assert.ok(selected.path.edgeIds.includes('fork-lower'));
  const preview = previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base', null, 'enemyBase', selected.path);
  assert.equal(preview.ok, true);
  assert.equal(preview.routeDistance, selected.physicalDistance);
  const result = dispatchFriendlySquad(state, 'assault', 'home-base', 'enemy-base', null, 'enemyBase', selected.path);
  assert.equal(result.ok, true);
  assert.deepEqual(result.squad.path.edgeIds, selected.path.edgeIds);
  assert.equal(result.squad.edgeId, 'home-fork');
});

test('deployment rejects a selected route after a wall makes it unusable', () => {
  const state = deploymentState();
  const path = { nodeIds: ['home', 'fork', 'lower', 'join', 'enemy'], edgeIds: ['home-fork', 'fork-lower', 'lower-join', 'join-enemy'], targetId: 'enemy', cost: 388 };
  state.combat.defenses = [{ id: 'wall', kind: 'barrier', edgeId: 'fork-lower', hp: 100, isGate: false }];
  const preview = previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base', null, 'enemyBase', path);
  assert.equal(preview.ok, false);
  assert.match(preview.reason, /選び直/);
});

test('a clipped terminal connects to an existing nearby intersection node', () => {
  const graph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [
      { id: 'west', x: -60, y: 0 }, { id: 'junction', x: 0, y: 0 }, { id: 'east', x: 60, y: 0 },
      { id: 'south', x: 0, y: -60 }, { id: 'tip', x: 0, y: 2.2 }, { id: 'north', x: 0, y: 60 }
    ],
    edges: [
      edge('west-junction', 'west', 'junction', 60), edge('junction-east', 'junction', 'east', 60),
      edge('south-junction', 'south', 'junction', 60), edge('tip-north', 'tip', 'north', 57.8)
    ]
  });
  const result = repairRoadGraphTopology(graph);
  assert.equal(result.changed, true);
  assert.ok(graph.adjacency.get('tip').some(connection => connection.to === 'junction'));
  assert.ok(findFriendlyRoadPath({ world: { roadGraph: graph }, combat: { defenses: [] } }, 'north', 'west'));
});

test('batched chunk restoration repairs terminals added before the final merge', () => {
  const base = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'left', x: -60, y: 0 }, { id: 'right', x: 60, y: 0 }],
    edges: [edge('main', 'left', 'right', 120)]
  });
  const first = attachGraphIndexes({
    center: base.center, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'tip', x: 0, y: 4 }, { id: 'north', x: 0, y: 60 }],
    edges: [edge('branch', 'tip', 'north', 56)]
  });
  const second = attachGraphIndexes({
    center: base.center, source: 'test', roadSpecVersion: 4,
    nodes: [{ id: 'far-a', x: 500, y: 0 }, { id: 'far-b', x: 550, y: 0 }],
    edges: [edge('far', 'far-a', 'far-b', 50)]
  });
  mergeRoadGraphs(base, first, { chunkId: '0:1', rebuildIndexes: false });
  const result = mergeRoadGraphs(base, second, { chunkId: '5:0', rebuildIndexes: true });
  assert.ok(result.splitEdges >= 2);
  assert.ok(findFriendlyRoadPath({ world: { roadGraph: base }, combat: { defenses: [] } }, 'north', 'left'));
});


test('periodic UI refresh keeps deployment route planning active without a deployed squad', () => {
  const state = deploymentState();
  const ui = Object.create(CombatUi.prototype);
  ui.cityHp = { textContent: '' };
  ui.enemyCount = { textContent: '' };
  ui.civilizationLevel = { textContent: '' };
  ui.selectedTool = 'select';
  ui.toolAffordabilitySignature = 'same';
  ui.affordabilitySignature = () => 'same';
  ui.context = { hidden: true };
  ui.orderPlanning = {
    mode: FRIENDLY_ORDER_MODE.DEPLOYMENT,
    originNodeId: 'home',
    squadType: 'assault',
    destinationNodeId: 'enemy',
    waypointNodeIds: [],
    routes: [],
    selectedRouteIndex: 0,
    startNodeId: 'home'
  };
  let cancelled = false;
  ui.cancelOrderPlanning = () => { cancelled = true; };
  ui.rebuildOrderRoutes = () => {};
  ui.renderTools = () => {};
  ui.refreshBuildPlacement = () => {};
  ui.renderContext = () => {};
  ui.update(state);
  assert.equal(cancelled, false);
  assert.equal(ui.orderPlanning.mode, FRIENDLY_ORDER_MODE.DEPLOYMENT);
});

test('interrupting deployment route planning invokes its cancellation callback', () => {
  const ui = Object.create(CombatUi.prototype);
  let cancelled = false;
  ui.orderPlanning = { onCancel: () => { cancelled = true; } };
  ui.selectedObject = { kind: 'enemyBase', id: 'target' };
  ui.renderer = { setFriendlyOrderPlanning: () => {}, setFocus: () => {} };
  ui.context = { hidden: false };
  ui.clearObjectSelection({ hideContext: false });
  assert.equal(cancelled, true);
  assert.equal(ui.orderPlanning, null);
});


test('a selected deployment route survives unrelated reroute notifications while still passable', () => {
  const state = deploymentState();
  const selected = buildDeploymentRouteOptions(state, 'assault', 'home', 'enemy', ['lower'])[0];
  const result = dispatchFriendlySquad(state, 'assault', 'home-base', 'enemy-base', null, 'enemyBase', selected.path);
  assert.equal(result.ok, true);
  const squad = result.squad;
  const selectedEdges = [...squad.path.edgeIds];
  squad.reroutePending = true;
  new FriendlyForceSystem().update(state, 0, { query: () => [] });
  assert.deepEqual(squad.path.edgeIds, selectedEdges);
  assert.equal(squad.reroutePending, false);
});

test('legacy saves without elevation metadata are refreshed without speculative grade-level joins', () => {
  const legacy = decodeRoadGraph({
    format: 'frontline-road-graph-2',
    center: { lat: 35, lon: 139 },
    source: 'legacy',
    roadSpecVersion: 3,
    nodes: [
      ['left', -60, 0, []], ['right', 60, 0, []],
      ['tip', 0, 4, []], ['north', 0, 60, []]
    ],
    edges: [
      ['main', 'left', 'right', 120, 5, 1, 'primary', '', 0, []],
      ['branch', 'tip', 'north', 56, 5, 1, 'residential', '', 0, []]
    ]
  });
  const graph = attachGraphIndexes(legacy);
  assert.equal(graph.edgeById.get('main').elevationKnown, false);
  const result = repairRoadGraphTopology(graph);
  assert.equal(result.splitEdges, 0);
  assert.equal(findFriendlyRoadPath({ world: { roadGraph: graph }, combat: { defenses: [] } }, 'north', 'left'), null);
});
