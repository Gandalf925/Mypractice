import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { initializeCombatState } from '../src/combat/combat-initializer.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { CivilizationSystem } from '../src/civilization/civilization-system.js';
import { ProgressionSystem, evaluateProject } from '../src/civilization/progression-system.js';
import { CIVILIZATION_PROJECTS, DEFENSE_LINES } from '../src/civilization/data.js';
import { consumeBundle } from '../src/civilization/inventory-system.js';
import { dispatchFriendlySquad, FRIENDLY_SQUAD_STATUS } from '../src/combat/friendly-force-system.js';

class BalanceEvents {
  constructor() { this.counts = {}; }
  emit(type) { this.counts[type] = (this.counts[type] ?? 0) + 1; }
}

function topology(kind) {
  if (kind === 'line') {
    const nodes = Array.from({ length: 25 }, (_, index) => ({ id: `n${index}`, x: index * 50, y: 0 }));
    const edges = Array.from({ length: 24 }, (_, index) => ({ id: `e${index}`, a: `n${index}`, b: `n${index + 1}`, length: 50, roadWidth: 6 }));
    return { graph: attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'balance-line', roadSpecVersion: 4, nodes, edges }), home: 'n0' };
  }
  if (kind === 'cross') {
    const nodes = [{ id: 'home', x: 0, y: 0 }];
    const edges = [];
    for (const [prefix, dx, dy] of [['e', 1, 0], ['w', -1, 0], ['n', 0, -1], ['s', 0, 1]]) {
      let previous = 'home';
      for (let index = 1; index <= 12; index += 1) {
        const id = `${prefix}${index}`;
        nodes.push({ id, x: dx * index * 50, y: dy * index * 50 });
        edges.push({ id: `${prefix}${index}`, a: previous, b: id, length: 50, roadWidth: 6 });
        previous = id;
      }
    }
    return { graph: attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'balance-cross', roadSpecVersion: 4, nodes, edges }), home: 'home' };
  }
  const size = 17;
  const center = 8;
  const nodes = [];
  const edges = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) nodes.push({ id: `n${row}_${column}`, x: (column - center) * 50, y: (row - center) * 50 });
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (column < size - 1) edges.push({ id: `h${row}_${column}`, a: `n${row}_${column}`, b: `n${row}_${column + 1}`, length: 50, roadWidth: 6 });
      if (row < size - 1) edges.push({ id: `v${row}_${column}`, a: `n${row}_${column}`, b: `n${row + 1}_${column}`, length: 50, roadWidth: 6 });
    }
  }
  return { graph: attachGraphIndexes({ center: { lat: 35, lon: 139 }, source: 'balance-grid', roadSpecVersion: 4, nodes, edges }), home: 'n8_8' };
}

function openingState(kind) {
  const state = createInitialState();
  const selected = topology(kind);
  const home = selected.graph.nodeById.get(selected.home);
  state.world.roadGraph = selected.graph;
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: selected.home, x: home.x, y: home.y, establishedAt: 1 };
  initializeCombatState(state);
  return state;
}

function addGun(state, index) {
  const definition = DEFENSE_LINES.single[0];
  if (!consumeBundle(state, definition.cost)) return false;
  const adjacent = state.world.roadGraph.adjacency.get(state.world.city.nodeId) ?? [];
  const nodeId = index === 0 ? state.world.city.nodeId : adjacent[index - 1]?.to ?? state.world.city.nodeId;
  state.combat.defenses.push({
    id: `opening-gun-${index}`, kind: 'tower', type: 'gun', line: 'single', tier: 0,
    nodeId, hp: definition.hp, maxHp: definition.hp, cooldown: 0, disabledTimer: 0, ruined: false, baseId: 'home-base'
  });
  return true;
}

function addBarrier(state) {
  if (state.combat.defenses.some(defense => defense.kind === 'barrier')) return true;
  const definition = DEFENSE_LINES.barrier[0];
  if (!consumeBundle(state, definition.cost)) return false;
  const edgeId = (state.world.roadGraph.adjacency.get(state.world.city.nodeId) ?? [])[0]?.edgeId;
  if (!edgeId) return false;
  state.combat.defenses.push({
    id: 'opening-barrier', kind: 'barrier', type: 'barrier', line: 'barrier', tier: 0,
    edgeId, hp: definition.hp, maxHp: definition.hp, cooldown: 0, disabledTimer: 0, ruined: false, isGate: false
  });
  return true;
}

function hasActiveMission(state) {
  return state.combat.friendlySquads.some(squad => squad.hp > 0 && ![FRIENDLY_SQUAD_STATUS.READY, FRIENDLY_SQUAD_STATUS.RECOVERING].includes(squad.status));
}

function dispatchNearest(state) {
  if (hasActiveMission(state)) return false;
  const target = state.world.enemyBases.filter(base => base.alive).sort((left, right) => left.routeDistance - right.routeDistance)[0];
  return target ? dispatchFriendlySquad(state, 'assault', 'home-base', target.id).ok : false;
}

function collectOneArtifact(state, combat) {
  const item = state.world.recoveryItems.find(candidate => candidate.status === 'AVAILABLE');
  if (!item) return false;
  const point = state.world.roadGraph.nodeById.get(item.nodeId);
  state.player.worldPosition = { x: point.x, y: point.y };
  state.player.locationAccuracy = 5;
  state.player.locationUpdatedAt = state.runtime.worldTimeMs;
  if (!combat.recoverySystem.beginCollection(state, item.id, state.runtime.worldTimeMs).ok) return false;
  combat.recoverySystem.update(state, 5, state.runtime.worldTimeMs);
  return true;
}

function contributeOpeningResources(state, progression) {
  const reserve = { wood: 20, stone: 20, fiber: 8 };
  for (const resource of Object.keys(CIVILIZATION_PROJECTS[1].contributions)) {
    const amount = Math.max(0, (state.inventory.resources[resource] ?? 0) - (reserve[resource] ?? 0));
    if (amount > 0) progression.contribute(state, resource, amount);
  }
}

function playBalancedOpening(kind) {
  const state = openingState(kind);
  const events = new BalanceEvents();
  const combat = new CombatSystem(events);
  const civilization = new CivilizationSystem(events);
  const progression = new ProgressionSystem(events);
  assert.equal(addGun(state, 0), true);
  assert.equal(addGun(state, 1), true);
  let readyAt = null;
  for (let elapsed = 0; elapsed < 60 * 60; elapsed += 1) {
    state.runtime.worldTimeMs += 1000;
    const recovering = state.combat.friendlySquads.some(squad => squad.hp > 0 && squad.status === FRIENDLY_SQUAD_STATUS.RECOVERING);
    if (elapsed % 5 === 0 && !recovering) dispatchNearest(state);
    if (state.statistics.campsCaptured >= 1) addBarrier(state);
    if (elapsed >= 10 * 60 && state.civilization.totalArtifactsRecovered < 1) collectOneArtifact(state, combat);
    if (elapsed % 10 === 0) {
      for (const defense of state.combat.defenses) {
        if (defense.hp / defense.maxHp < 0.55) progression.repairDefense(state, defense.id);
      }
      if (state.statistics.kills >= 20 && state.combat.defenses.length >= 3) contributeOpeningResources(state, progression);
    }
    const evaluation = evaluateProject(state);
    if (evaluation.complete && readyAt == null) readyAt = elapsed;
    if (evaluation.complete && state.civilization.project?.status !== 'BUILDING') progression.start(state);
    combat.update(state, 1);
    civilization.update(state, 1);
    if (state.civilization.level >= 1) return { state, events, readyAt, completedAt: elapsed };
  }
  return { state, events, readyAt, completedAt: null };
}

for (const kind of ['line', 'cross', 'grid']) {
  test(`balanced opening reaches civilization level one without collapse on a ${kind} road network`, () => {
    const result = playBalancedOpening(kind);
    assert.notEqual(result.completedAt, null);
    assert.ok(result.completedAt >= 20 * 60 && result.completedAt <= 40 * 60, `unexpected completion time: ${result.completedAt}s`);
    assert.equal(result.events.counts['combat:city-defeated'] ?? 0, 0);
    assert.equal(result.events.counts['friendly:squad-destroyed'] ?? 0, 0);
    assert.ok(result.state.statistics.kills >= 20);
    assert.ok(result.state.statistics.campsCaptured >= 1);
    assert.ok(result.state.civilization.totalArtifactsRecovered >= 1);
  });
}

test('attack-only opening can suppress the first bases but still causes material losses', () => {
  const state = openingState('grid');
  const initialBaseCount = state.world.enemyBases.filter(base => base.alive).length;
  const events = new BalanceEvents();
  const combat = new CombatSystem(events);
  const civilization = new CivilizationSystem(events);
  for (let elapsed = 0; elapsed < 60 * 60; elapsed += 1) {
    state.runtime.worldTimeMs += 1000;
    if (elapsed % 5 === 0) dispatchNearest(state);
    combat.update(state, 1);
    civilization.update(state, 1);
  }
  assert.ok(state.statistics.campsCaptured >= initialBaseCount);
  assert.ok((events.counts['friendly:squad-destroyed'] ?? 0) >= 1);
  assert.ok((events.counts['combat:city-defeated'] ?? 0) >= 1);
  assert.ok(state.inventory.resources.wood < 150 || state.inventory.resources.stone < 100 || state.inventory.resources.fiber < 70);
});
