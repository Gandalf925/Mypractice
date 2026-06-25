import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { ProductionSystem } from '../src/civilization/production-system.js';
import { ProgressionSystem, evaluateProject, projectContributionReserve } from '../src/civilization/progression-system.js';
import { recalculateCapacity } from '../src/civilization/inventory-system.js';
import { diagnoseFieldBaseNetwork } from '../src/base/field-base-system.js';
import { BuildSystem } from '../src/combat/build-system.js';
import {
  FriendlyForceSystem,
  previewCoordinatedDeployment,
  dispatchCoordinatedSquads
} from '../src/combat/friendly-force-system.js';

function graphFixture(nodes, pairs) {
  return attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'v031-test', roadSpecVersion: 4,
    nodes,
    edges: pairs.map(([id, a, b, length]) => ({ id, a, b, length, roadWidth: 6 }))
  });
}

function civilizationFixture(level = 1) {
  const state = createInitialState();
  state.world.roadGraph = graphFixture(
    [{ id: 'home', x: 0, y: 0 }, { id: 'road', x: 200, y: 0 }],
    [['edge', 'home', 'road', 200]]
  );
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.civilization.level = level;
  ensureCivilizationState(state);
  recalculateCapacity(state);
  return state;
}

test('batch production queues 1, 5, 10 or the maximum without double-reserving inputs', () => {
  const state = civilizationFixture(1);
  state.civilization.buildings.push({
    id: 'carpentry', type: 'carpentry', hp: 240, maxHp: 240,
    outputBuffer: {}, history: { produced: 0, repairs: 0 }
  });
  state.inventory.resources.wood = 200;
  const system = new ProductionSystem();
  assert.equal(system.maximumProducible(state, 'carpentry', 'timber').quantity, 20);
  const queued = system.enqueue(state, 'carpentry', 'timber', 10);
  assert.equal(queued.ok, true);
  assert.equal(queued.quantity, 10);
  assert.equal(system.queueSummary(state, 'carpentry').pendingUnits, 10);
  assert.equal(system.maximumProducible(state, 'carpentry', 'timber').quantity, 10);
  system.update(state, 600);
  assert.equal(state.inventory.resources.timber, 10);
  assert.equal(state.inventory.resources.wood, 100);
  assert.equal(system.queueSummary(state, 'carpentry').pendingUnits, 0);
});

test('project-only production caps queued units, starts the existing order, and cannot overshoot the target', () => {
  const state = civilizationFixture(2);
  state.civilization.buildings.push({
    id: 'trial-furnace', type: 'trialBronzeFurnace', hp: 240, maxHp: 240,
    outputBuffer: {}, history: { produced: 0, repairs: 0 }
  });
  Object.assign(state.inventory.resources, { copperIngot: 18, tinIngot: 6, charcoal: 12 });
  const system = new ProductionSystem();
  const queued = system.enqueue(state, 'trial-furnace', 'trialBronze', 99);
  assert.equal(queued.ok, true);
  assert.equal(queued.quantity, 6);
  assert.equal(Boolean(queued.queue.current), true);
  assert.equal(system.enqueue(state, 'trial-furnace', 'trialBronze', 1).ok, false);
  system.update(state, 6 * 420);
  assert.equal(state.civilization.project.contributions.bronzeIngot, 24);
  assert.equal(state.civilization.progress.selfProducedBronze, 24);
  assert.equal(system.queueSummary(state, 'trial-furnace').pendingUnits, 0);
});

test('safe civilization contribution keeps the declared defense reserve while explicit full contribution may use it', () => {
  const state = civilizationFixture(1);
  state.inventory.resources.wood = 300;
  const system = new ProgressionSystem();
  assert.equal(projectContributionReserve(state, 'wood'), 80);
  const safe = system.contributeSafely(state, 'wood');
  assert.deepEqual({ ok: safe.ok, amount: safe.amount }, { ok: true, amount: 220 });
  assert.equal(state.inventory.resources.wood, 80);
  assert.equal(state.civilization.project.contributions.wood, 220);
  const all = system.contribute(state, 'wood');
  assert.equal(all.ok, true);
  assert.equal(all.amount, 40);
  assert.equal(state.inventory.resources.wood, 40);
  assert.equal(state.civilization.project.contributions.wood, 260);
});

function coordinatedFixture() {
  const state = createInitialState();
  state.world.roadGraph = graphFixture([
    { id: 'home', x: 0, y: 0 }, { id: 'major2', x: 100, y: 100 }, { id: 'major3', x: 200, y: -100 },
    { id: 'join', x: 300, y: 0 }, { id: 'enemy', x: 500, y: 0 }
  ], [
    ['home-join', 'home', 'join', 300], ['major2-join', 'major2', 'join', 225],
    ['major3-join', 'major3', 'join', 142], ['join-enemy', 'join', 'enemy', 200]
  ]);
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [
    { ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 },
    { id: 'major-2', name: '主要拠点 2', status: 'ESTABLISHED', nodeId: 'major2', x: 100, y: 100, hp: 100, maxHp: 100, establishedAt: 2 },
    { id: 'major-3', name: '主要拠点 3', status: 'ESTABLISHED', nodeId: 'major3', x: 200, y: -100, hp: 100, maxHp: 100, establishedAt: 3 }
  ];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'target', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1 }];
  state.civilization.level = 3;
  ensureCivilizationState(state);
  state.inventory.capacity = { base: 9999, processed: 9999, ore: 9999, metal: 9999 };
  for (const key of Object.keys(state.inventory.resources)) state.inventory.resources[key] = 999;
  return state;
}

test('coordinated deployment can use multiple slots from one base and synchronizes mixed squads to one arrival time', () => {
  const state = coordinatedFixture();
  const requested = ['assault', 'siege', 'heavy'];
  const preview = previewCoordinatedDeployment(state, 'target', requested);
  assert.equal(preview.ok, true);
  const assignmentCounts = preview.assignments.reduce((counts, item) => counts.set(item.origin.id, (counts.get(item.origin.id) ?? 0) + 1), new Map());
  assert.ok(Math.max(...assignmentCounts.values()) >= 2);
  assert.equal(preview.slowestSpeed, 0.7);
  const arrivals = preview.assignments.map(item => item.departDelay + item.routeDistance / item.definition.speed);
  assert.ok(arrivals.every(value => Math.abs(value - arrivals[0]) < 1e-6));
  const before = { ...state.inventory.resources };
  const result = dispatchCoordinatedSquads(state, 'target', requested);
  assert.equal(result.ok, true);
  assert.equal(result.squads.length, 3);
  assert.equal(new Set(result.squads.map(squad => squad.formationId)).size, 1);
  for (const [resource, amount] of Object.entries(preview.cost)) assert.equal(state.inventory.resources[resource], before[resource] - amount);
  const leading = result.squads.find(squad => squad.departDelay === 0);
  const force = new FriendlyForceSystem();
  force.update(state, 1, { query: () => [], positions: new Map() });
  const leadingDefinition = preview.assignments.find(item => item.squadType === leading.type).definition;
  assert.ok(Math.abs(leading.edgeProgress - leadingDefinition.speed) < 1e-6);
});

test('simple-base network diagnostic distinguishes sufficient and insufficient acquired roads', () => {
  const state = civilizationFixture(4);
  state.world.roadGraph = graphFixture([
    { id: 'home', x: 0, y: 0 }, { id: 'a', x: 200, y: 0 }, { id: 'b', x: 400, y: 0 }, { id: 'c', x: 600, y: 0 }
  ], [['a0', 'home', 'a', 200], ['a1', 'a', 'b', 200], ['a2', 'b', 'c', 200]]);
  state.world.playerBases = [{ id: 'home-base', name: '本拠地', status: 'ESTABLISHED', primary: true, nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 }];
  state.world.enemyBases = [];
  const sufficient = diagnoseFieldBaseNetwork(state, 3);
  assert.equal(sufficient.sufficient, true);
  assert.ok(sufficient.confirmedAdditional >= 3);
  state.world.roadGraph = graphFixture(
    [{ id: 'home', x: 0, y: 0 }, { id: 'near', x: 80, y: 0 }],
    [['near-road', 'home', 'near', 80]]
  );
  const insufficient = diagnoseFieldBaseNetwork(state, 3);
  assert.equal(insufficient.sufficient, false);
  assert.match(insufficient.guidance, /道路をさらに取得/);
});


test('listed barrier sites use an in-range projection and remain valid for construction on dense roads', () => {
  const state = civilizationFixture(0);
  state.world.roadGraph = graphFixture([
    { id: 'home', x: 0, y: 0 },
    { id: 'left-top', x: -50, y: -100 },
    { id: 'left-bottom', x: -50, y: -50 }
  ], [
    ['dense-edge', 'left-top', 'left-bottom', 50]
  ]);
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.player.worldPosition = null;
  Object.assign(state.inventory.resources, { wood: 150, stone: 100, fiber: 70 });
  const system = new BuildSystem();
  const site = system.listBuildSites(state, 'barrier').find(candidate => candidate.edgeId === 'dense-edge');
  assert.ok(site, 'the segment intersects the build radius and must be listed');
  assert.ok(Math.hypot(site.point.x, site.point.y) <= 85 + 1e-6, 'the emitted point must itself be inside the build radius');
  const result = system.buildCandidate(state, site);
  assert.equal(result.ok, true);
  assert.equal(state.combat.defenses.length, 1);
  assert.equal(state.civilization.progress.barriersBuilt, 1);

  result.defense.hp = 0;
  system.removeDefense(state, result.defense.id);
  const barrierCheck = evaluateProject(state).checks.find(check => check.key === 'barrier0');
  assert.equal(barrierCheck.complete, true, 'the one-time construction requirement must not reverse after battle damage');
});

test('gameplay stabilization controls are present in UI source and field-base text includes retrieval squads', async () => {
  const civilizationUi = await readFile(new URL('../src/ui/civilization-ui.js', import.meta.url), 'utf8');
  const deploymentUi = await readFile(new URL('../src/ui/deployment-ui.js', import.meta.url), 'utf8');
  const baseUi = await readFile(new URL('../src/ui/base-command-ui.js', import.meta.url), 'utf8');
  const definitions = await readFile(new URL('../src/combat/friendly-force-definitions.js', import.meta.url), 'utf8');
  assert.match(civilizationUi, /data-quantity="5"/);
  assert.match(civilizationUi, /data-quantity="10"/);
  assert.match(civilizationUi, /data-quantity="max"/);
  assert.match(civilizationUi, /contribute-safe/);
  assert.match(civilizationUi, /突撃部隊・遊撃部隊・回収部隊/);
  assert.match(deploymentUi, /連携出撃/);
  assert.match(deploymentUi, /dispatch-group/);
  assert.match(baseUi, /道路網診断/);
  assert.match(definitions, /連携出撃で護衛が必要/);
});
