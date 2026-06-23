import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';

function makeState() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'near', x: 60, y: 0 },
      { id: 'far', x: 140, y: 0 },
      { id: 'crossA', x: -100, y: 40 },
      { id: 'crossB', x: 100, y: 40 }
    ],
    edges: [
      { id: 'home-near', a: 'home', b: 'near', length: 60, roadWidth: 5 },
      { id: 'near-far', a: 'near', b: 'far', length: 80, roadWidth: 5 },
      { id: 'cross', a: 'crossA', b: 'crossB', length: 200, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [];
  state.combat.defenses = [];
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('existing facilities expand build sites beyond the original home-base range', () => {
  const state = makeState();
  state.combat.defenses.push({ id: 'occupied', kind: 'tower', type: 'gun', nodeId: 'near', hp: 100, maxHp: 100, ruined: false });
  const build = new BuildSystem();

  const gunSites = build.listBuildSites(state, 'gun');
  assert.ok(gunSites.some(site => site.nodeId === 'home'));
  assert.ok(gunSites.some(site => site.nodeId === 'far'));
  assert.ok(gunSites.some(site => site.anchorKind === 'DEFENSE'));
  assert.deepEqual(build.listBuildSites(state, 'barrier').map(site => site.edgeId).sort(), ['cross', 'home-near', 'near-far']);
});

test('previewing a candidate does not consume resources or create a defense', () => {
  const state = makeState();
  const build = new BuildSystem();
  const before = { ...state.inventory.resources };

  const preview = build.previewAt(state, 'gun', { x: 59, y: 1 }, 5);

  assert.equal(preview.ok, true);
  assert.equal(preview.candidate.nodeId, 'near');
  assert.equal(preview.affordable, true);
  assert.deepEqual(state.inventory.resources, before);
  assert.equal(state.combat.defenses.length, 0);
});

test('a confirmed candidate consumes resources exactly once and creates the selected defense', () => {
  const state = makeState();
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);

  const result = build.buildCandidate(state, preview.candidate);

  assert.equal(result.ok, true);
  assert.equal(result.defense.type, 'gun');
  assert.equal(result.defense.nodeId, 'near');
  assert.equal(state.combat.defenses.length, 1);
  assert.equal(state.inventory.resources.wood, 472);
  assert.equal(state.inventory.resources.stone, 478);
  assert.equal(state.inventory.resources.fiber, 492);
});

test('a stale candidate is rejected without spending resources', () => {
  const state = makeState();
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  state.combat.defenses.push({ id: 'other', kind: 'tower', type: 'gun', nodeId: 'near', hp: 100, maxHp: 100, ruined: false });
  const before = { ...state.inventory.resources };

  const result = build.buildCandidate(state, preview.candidate);

  assert.equal(result.ok, false);
  assert.match(result.reason, /すでに設備/);
  assert.deepEqual(state.inventory.resources, before);
  assert.equal(state.combat.defenses.length, 1);
});

test('candidate confirmation rechecks resources that changed after preview', () => {
  const state = makeState();
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  state.inventory.resources.wood = 0;
  const before = { ...state.inventory.resources };

  const result = build.buildCandidate(state, preview.candidate);

  assert.equal(result.ok, false);
  assert.match(result.reason, /資源が不足/);
  assert.deepEqual(state.inventory.resources, before);
  assert.equal(state.combat.defenses.length, 0);
});

test('barrier candidates retain the tapped road position and reject out-of-range points', () => {
  const state = makeState();
  const build = new BuildSystem();

  const valid = build.previewAt(state, 'barrier', { x: 20, y: 42 }, 5);
  const invalid = build.previewAt(state, 'barrier', { x: 120, y: 0 }, 5);

  assert.equal(valid.ok, true);
  assert.equal(valid.candidate.edgeId, 'cross');
  assert.deepEqual(valid.candidate.point, { x: 20, y: 40 });
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /85m以内/);
});


test('rebuilding a ruined placement at the same world time creates a distinct defense id', () => {
  const state = makeState();
  const build = new BuildSystem();
  const firstPreview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  const first = build.buildCandidate(state, firstPreview.candidate);
  first.defense.hp = 0;
  first.defense.ruined = true;

  const secondPreview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  const second = build.buildCandidate(state, secondPreview.candidate);

  assert.equal(second.ok, true);
  assert.notEqual(second.defense.id, first.defense.id);
});

test('preview skips an occupied nearest intersection when another valid intersection is within the tap tolerance', () => {
  const state = makeState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'occupied', x: 60, y: 0 },
      { id: 'available', x: 60, y: 4 }
    ],
    edges: [
      { id: 'road-a', a: 'home', b: 'occupied', length: 60, roadWidth: 5 },
      { id: 'road-b', a: 'home', b: 'available', length: 60.2, roadWidth: 5 }
    ]
  });
  state.combat.defenses.push({ id: 'tower-a', kind: 'tower', type: 'gun', nodeId: 'occupied', hp: 100, maxHp: 100, ruined: false });

  const result = new BuildSystem().previewAt(state, 'gun', { x: 60, y: 1 }, 5);

  assert.equal(result.ok, true);
  assert.equal(result.candidate.nodeId, 'available');
});

test('preview skips an occupied nearest road when another valid road is within the tap tolerance', () => {
  const state = makeState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'a1', x: 60, y: 0 },
      { id: 'b0', x: 0, y: 4 },
      { id: 'b1', x: 60, y: 4 }
    ],
    edges: [
      { id: 'occupied-road', a: 'home', b: 'a1', length: 60, roadWidth: 5 },
      { id: 'available-road', a: 'b0', b: 'b1', length: 60, roadWidth: 5 }
    ]
  });
  state.combat.defenses.push({ id: 'barrier-a', kind: 'barrier', type: 'barrier', edgeId: 'occupied-road', hp: 100, maxHp: 100, ruined: false });

  const result = new BuildSystem().previewAt(state, 'barrier', { x: 30, y: 1 }, 5);

  assert.equal(result.ok, true);
  assert.equal(result.candidate.edgeId, 'available-road');
  assert.deepEqual(result.candidate.point, { x: 30, y: 4 });
});


test('player position creates a second build zone away from the home base', () => {
  const state = makeState();
  state.player.worldPosition = { x: 140, y: 0 };
  const build = new BuildSystem();

  const sites = build.listBuildSites(state, 'gun');
  const preview = build.previewAt(state, 'gun', { x: 140, y: 0 }, 5);

  assert.ok(sites.some(site => site.nodeId === 'far' && site.anchorId === 'player'));
  assert.equal(preview.ok, true);
  assert.equal(preview.candidate.nodeId, 'far');
  assert.equal(preview.candidate.anchorId, 'player');
  assert.equal(preview.candidate.anchorLabel, '現在地');
});

test('a current-location candidate is rejected if the player leaves its build zone before confirmation', () => {
  const state = makeState();
  state.player.worldPosition = { x: 140, y: 0 };
  const build = new BuildSystem();
  const preview = build.previewAt(state, 'gun', { x: 140, y: 0 }, 5);
  state.player.worldPosition = { x: 300, y: 0 };
  const before = { ...state.inventory.resources };

  const result = build.buildCandidate(state, preview.candidate);

  assert.equal(result.ok, false);
  assert.match(result.reason, /建設可能範囲内/);
  assert.deepEqual(state.inventory.resources, before);
});

test('overlapping home-base and player positions are represented as one build zone', () => {
  const state = makeState();
  state.player.worldPosition = { x: 0.2, y: 0.1 };

  const anchors = new BuildSystem().getBuildAnchors(state);

  assert.deepEqual(anchors.map(anchor => anchor.id), ['base']);
});


test('existing facilities create expanded construction anchors for additional defenses', () => {
  const state = makeState();
  const build = new BuildSystem();
  const first = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  assert.equal(build.buildCandidate(state, first.candidate).ok, true);

  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'near', x: 60, y: 0 },
      { id: 'outer', x: 170, y: 0 },
      { id: 'beyond', x: 240, y: 0 }
    ],
    edges: [
      { id: 'home-near', a: 'home', b: 'near', length: 60, roadWidth: 5 },
      { id: 'near-outer', a: 'near', b: 'outer', length: 110, roadWidth: 5 },
      { id: 'outer-beyond', a: 'outer', b: 'beyond', length: 70, roadWidth: 5 }
    ]
  });

  const sites = build.listBuildSites(state, 'gun');
  assert.ok(sites.some(site => site.nodeId === 'outer' && site.anchorKind === 'DEFENSE'));
  assert.ok(!sites.some(site => site.nodeId === 'beyond'));
});
