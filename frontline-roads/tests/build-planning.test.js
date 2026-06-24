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

test('existing facilities do not expand construction beyond bases and the player', () => {
  const state = makeState();
  state.combat.defenses.push({ id: 'occupied', kind: 'tower', type: 'gun', nodeId: 'near', hp: 100, maxHp: 100, ruined: false });
  const build = new BuildSystem();

  assert.deepEqual(build.getBuildAnchors(state).map(anchor => anchor.kind), ['MAJOR']);
  assert.deepEqual(build.listBuildSites(state, 'gun').map(site => site.nodeId), ['home']);
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
  assert.match(result.reason, /設備または残骸/);
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
  assert.match(invalid.reason, /主要拠点85m/);
});


test('a ruined placement blocks replacement construction until the wreck is repaired or removed', () => {
  const state = makeState();
  const build = new BuildSystem();
  const firstPreview = build.previewAt(state, 'gun', { x: 60, y: 0 }, 5);
  const first = build.buildCandidate(state, firstPreview.candidate);
  first.defense.hp = 0;
  first.defense.ruined = true;

  const secondPreview = build.previewAt(state, 'mortar', { x: 60, y: 0 }, 5);

  assert.equal(secondPreview.ok, false);
  assert.match(secondPreview.reason, /残骸/);
  assert.equal(state.combat.defenses.length, 1);
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


test('a remote facility stays outside the build zone until the player physically reaches it', () => {
  const state = makeState();
  const build = new BuildSystem();
  state.combat.defenses.push({ id: 'remote-anchor-attempt', kind: 'tower', type: 'gun', nodeId: 'near', hp: 100, maxHp: 100, ruined: false });
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 1,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'near', x: 60, y: 0 },
      { id: 'outer', x: 170, y: 0 }
    ],
    edges: [
      { id: 'home-near', a: 'home', b: 'near', length: 60, roadWidth: 5 },
      { id: 'near-outer', a: 'near', b: 'outer', length: 110, roadWidth: 5 }
    ]
  });

  assert.ok(!build.listBuildSites(state, 'gun').some(site => site.nodeId === 'outer'));
  state.player.worldPosition = { x: 170, y: 0 };
  assert.ok(build.listBuildSites(state, 'gun').some(site => site.nodeId === 'outer' && site.anchorKind === 'PLAYER'));
});

test('removing a defense reopens its placement and invalidates enemy routes', () => {
  const state = makeState();
  const build = new BuildSystem();
  state.combat.defenses.push({ id: 'remove-me', kind: 'tower', type: 'gun', nodeId: 'near', hp: 150, maxHp: 150, ruined: false });
  state.combat.enemies.push({ id: 'enemy', hp: 10, targetDefenseId: 'remove-me', reroutePending: false });

  const result = build.removeDefense(state, 'remove-me');

  assert.equal(result.ok, true);
  assert.equal(state.combat.defenses.length, 0);
  assert.equal(state.combat.enemies[0].targetDefenseId, null);
  assert.equal(state.combat.enemies[0].reroutePending, true);
  assert.ok(build.listBuildSites(state, 'gun').some(site => site.nodeId === 'near'));
});

test('removing an unknown defense does not mutate the state', () => {
  const state = makeState();
  const before = structuredClone(state.combat.defenses);
  const result = new BuildSystem().removeDefense(state, 'missing');
  assert.equal(result.ok, false);
  assert.deepEqual(state.combat.defenses, before);
});
