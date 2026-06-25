import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { defenseWorldPosition } from '../src/combat/combat-geometry.js';
import { findFriendlyRoadPath } from '../src/combat/routing-system.js';
import { defenseTierDefinition } from '../src/civilization/data.js';

function stateWithGraph(nodes, edges, level = 7) {
  const state = createInitialState();
  state.civilization.level = level;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'v0332-test', roadSpecVersion: 5, nodes, edges
  });
  const home = nodes[0];
  state.world.homeBase = { id: 'home-base', name: '本拠地', primary: true, status: 'ESTABLISHED', nodeId: home.id, x: home.x, y: home.y, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase }];
  state.world.city = { nodeId: home.id, hp: 100, maxHp: 100 };
  state.world.enemyBases = [];
  state.combat.defenses = [];
  state.combat.enemies = [];
  state.combat.friendlySquads = [];
  Object.assign(state.inventory.resources, {
    wood: 9999, stone: 9999, fiber: 9999, timber: 9999, rope: 9999,
    cutStone: 9999, bronzeIngot: 9999, wroughtIron: 9999, steel: 9999, mechanism: 9999
  });
  state.inventory.capacity = { base: 99999, processed: 99999, ore: 99999, metal: 99999 };
  return state;
}

test('dense straight roads expose sparse tactical tower sites instead of every shape node', () => {
  const nodes = Array.from({ length: 31 }, (_, index) => ({ id: `n${String(index).padStart(2, '0')}`, x: index * 10, y: 0 }));
  const edges = Array.from({ length: 30 }, (_, index) => ({ id: `e${index}`, a: nodes[index].id, b: nodes[index + 1].id, length: 10, roadWidth: 5 }));
  const state = stateWithGraph(nodes, edges);
  const sites = new BuildSystem().listBuildSites(state, 'gun');
  assert.ok(sites.length >= 5, 'long roads still need usable construction points');
  assert.ok(sites.length <= 8, `expected sparse sites, received ${sites.length}`);
  assert.ok(sites.length <= Math.floor(nodes.length * 0.3));
});

test('a straight chain is consolidated into bounded wall sections', () => {
  const nodes = Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`, x: index * 20, y: 0 }));
  const edges = Array.from({ length: 10 }, (_, index) => ({ id: `e${index}`, a: `n${index}`, b: `n${index + 1}`, length: 20, roadWidth: 5 }));
  const state = stateWithGraph(nodes, edges);
  const sites = new BuildSystem().listBuildSites(state, 'barrier');
  assert.equal(sites.length, 2);
  assert.ok(sites.every(site => site.barrierSectionEdgeIds.length > 1));
});

test('physically duplicate road edges cannot receive overlapping new walls', () => {
  const state = stateWithGraph([
    { id: 'a1', x: 0, y: 0 }, { id: 'b1', x: 80, y: 0 },
    { id: 'a2', x: 0, y: 0 }, { id: 'b2', x: 80, y: 0 }
  ], [
    { id: 'first', a: 'a1', b: 'b1', length: 80, roadWidth: 5 },
    { id: 'duplicate', a: 'a2', b: 'b2', length: 80, roadWidth: 5 }
  ], 0);
  const build = new BuildSystem();
  const sites = build.listBuildSites(state, 'barrier');
  assert.equal(sites.length, 2);
  assert.equal(build.buildCandidate(state, sites[0]).ok, true);
  assert.equal(build.listBuildSites(state, 'barrier').length, 0);
});

test('new walls preserve their tactical placement point after construction', () => {
  const state = stateWithGraph([
    { id: 'home', x: 0, y: 0 }, { id: 'a', x: -50, y: -100 }, { id: 'b', x: -50, y: -50 }
  ], [{ id: 'road', a: 'a', b: 'b', length: 50, roadWidth: 5 }], 0);
  const build = new BuildSystem();
  const site = build.listBuildSites(state, 'barrier')[0];
  assert.ok(site);
  const result = build.buildCandidate(state, site);
  assert.equal(result.ok, true);
  assert.deepEqual(defenseWorldPosition(state.world.roadGraph, result.defense), site.point);
});

test('walls block friendly road routing while gates preserve the friendly corridor', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 0 }, { id: 'c', x: 0, y: 80 }, { id: 'd', x: 100, y: 0 }
  ];
  const edges = [
    { id: 'ab', a: 'a', b: 'b', length: 50 }, { id: 'bd', a: 'b', b: 'd', length: 50 },
    { id: 'ac', a: 'a', b: 'c', length: 80 }, { id: 'cd', a: 'c', b: 'd', length: 128 }
  ];
  const state = stateWithGraph(nodes, edges);
  state.combat.defenses = [{ id: 'wall', kind: 'barrier', type: 'barrier', edgeId: 'ab', hp: 100, maxHp: 100, isGate: false }];
  assert.deepEqual(findFriendlyRoadPath(state, 'a', 'd').edgeIds, ['ac', 'cd']);
  state.combat.defenses[0].isGate = true;
  assert.deepEqual(findFriendlyRoadPath(state, 'a', 'd').edgeIds, ['ab', 'bd']);
});

test('gates trade durability for friendly passage instead of being stronger walls', () => {
  for (let tier = 2; tier <= 7; tier += 1) {
    assert.ok(defenseTierDefinition('barrier', tier, true).hp < defenseTierDefinition('barrier', tier, false).hp);
  }
});

test('support facilities expose no more than six representative sites per anchor', () => {
  const nodes = [{ id: 'home', x: 0, y: 0 }];
  const edges = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = index / 10 * Math.PI * 2;
    const node = { id: `s${index}`, x: Math.cos(angle) * 70, y: Math.sin(angle) * 70 };
    nodes.push(node);
    edges.push({ id: `r${index}`, a: 'home', b: node.id, length: 70, roadWidth: 5 });
  }
  const state = stateWithGraph(nodes, edges, 1);
  assert.ok(new BuildSystem().listBuildSites(state, 'survey').length <= 6);
});

test('only route-changing wall construction invalidates active paths', () => {
  const state = stateWithGraph([
    { id: 'home', x: 0, y: 0 }, { id: 'middle', x: 60, y: 0 }, { id: 'end', x: 120, y: 0 }
  ], [
    { id: 'first', a: 'home', b: 'middle', length: 60, roadWidth: 5 },
    { id: 'second', a: 'middle', b: 'end', length: 60, roadWidth: 5 }
  ], 1);
  state.combat.enemies = [{ id: 'enemy', hp: 50, reroutePending: false }];
  state.combat.friendlySquads = [{ id: 'squad', hp: 50, type: 'assault', status: 'OUTBOUND', edgeId: null, reroutePending: false }];
  const build = new BuildSystem();
  const tower = build.listBuildSites(state, 'gun')[0];
  assert.equal(build.buildCandidate(state, tower).ok, true);
  assert.equal(state.combat.enemies[0].reroutePending, false);
  assert.equal(state.combat.friendlySquads[0].reroutePending, false);
  const wall = build.listBuildSites(state, 'barrier')[0];
  assert.equal(build.buildCandidate(state, wall).ok, true);
  assert.equal(state.combat.enemies[0].reroutePending, true);
  assert.equal(state.combat.friendlySquads[0].reroutePending, true);
});
