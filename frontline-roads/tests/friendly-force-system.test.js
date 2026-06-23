import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchAssaultSquad,
  previewAssaultDeployment
} from '../src/combat/friendly-force-system.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function stateFixture({ remote = false } = {}) {
  const state = createInitialState();
  const middle = remote ? 1500 : 100;
  const end = remote ? 3000 : 200;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'middle', x: middle, y: 0 },
      { id: 'enemy', x: end, y: 0 }
    ],
    edges: [
      { id: 'road-a', a: 'home', b: 'middle', length: middle, roadWidth: 5 },
      { id: 'road-b', a: 'middle', b: 'enemy', length: end - middle, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{
    id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 30, maxHp: 30,
    alive: true, level: 1, spawnClock: 0, wavesSent: 0
  }];
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  Object.assign(state.inventory.resources, { wood: 200, stone: 200, fiber: 200 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('deployment preview is non-destructive and dispatch spends the assault cost once', () => {
  const state = stateFixture();
  const before = { ...state.inventory.resources };
  const preview = previewAssaultDeployment(state, 'home-base', 'enemy-base');
  assert.equal(preview.ok, true);
  assert.equal(preview.routeDistance, 200);
  assert.deepEqual(state.inventory.resources, before);
  const result = dispatchAssaultSquad(state, 'home-base', 'enemy-base');
  assert.equal(result.ok, true);
  assert.equal(state.combat.friendlySquads.length, 1);
  assert.equal(state.inventory.resources.wood, before.wood - result.cost.wood);
  assert.equal(dispatchAssaultSquad(state, 'home-base', 'enemy-base').ok, false);
});

test('friendly squad stops to fight enemies and both sides exchange damage', () => {
  const state = stateFixture();
  const system = new FriendlyForceSystem();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'middle';
  squad.path = { nodeIds: ['middle', 'enemy'], edgeIds: ['road-b'], targetId: 'enemy', cost: 100 };
  squad.pathIndex = 0;
  squad.edgeId = 'road-b';
  squad.edgeProgress = 0;
  state.combat.enemies.push({
    id: 'blocker', type: 'infantry', hp: 50, maxHp: 50, nodeId: 'middle', path: null,
    pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, departDelay: 0,
    sourceBaseId: 'enemy-base', waveId: null, rewardGranted: false, reroutePending: false
  });
  const combat = new CombatSystem(null);
  combat.update(state, 1);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.ENGAGED);
  assert.ok(state.combat.enemies[0].hp < 50);
  assert.ok(squad.hp < squad.maxHp);
  system.update(state, 0, { query: () => [], positions: new Map() });
});

test('squad destroys an enemy base, schedules respawn and returns to its origin', () => {
  const state = stateFixture();
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'enemy';
  squad.path = { nodeIds: ['enemy'], edgeIds: [], targetId: 'enemy', cost: 0 };
  squad.pathIndex = 0;
  squad.edgeId = null;
  const system = new FriendlyForceSystem();
  const emptySpatial = { query: () => [], positions: new Map() };
  for (let index = 0; index < 5; index += 1) system.update(state, 1, emptySpatial);
  assert.equal(state.world.enemyBases[0].alive, false);
  assert.equal(state.world.baseRespawns.length, 1);
  assert.equal(state.statistics.campsCaptured, 1);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.RETURNING);
  for (let index = 0; index < 280; index += 1) system.update(state, 1, emptySpatial);
  assert.equal(state.combat.friendlySquads.length, 1);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.READY);
  assert.equal(squad.hp, squad.maxHp);
});

test('friendly squads survive JSON save and restore without exact base coordinates', () => {
  const state = stateFixture();
  dispatchAssaultSquad(state, 'home-base', 'enemy-base');
  state.world.playerBases[0].location = { lat: 35.1234567, lon: 139.1234567 };
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'friendly-test');
  repository.save(state);
  const raw = storage.getItem('friendly-test');
  assert.equal(raw.includes('35.1234567'), false);
  const restored = repository.load();
  assert.equal(restored.combat.friendlySquads.length, 1);
  assert.equal(restored.world.playerBases.length, 1);
});

test('remote friendly squads only advance when the dormant regional interval is due', () => {
  const state = stateFixture({ remote: true });
  const squad = dispatchAssaultSquad(state, 'home-base', 'enemy-base').squad;
  squad.nodeId = 'enemy';
  squad.path = { nodeIds: ['enemy', 'middle'], edgeIds: ['road-b'], targetId: 'home', cost: 1500 };
  squad.pathIndex = 0;
  squad.edgeId = 'road-b';
  squad.edgeProgress = 0;
  squad.status = FRIENDLY_SQUAD_STATUS.RETURNING;
  const combat = new CombatSystem(null);
  for (let index = 0; index < 7; index += 1) combat.update(state, 1);
  assert.equal(squad.edgeProgress, 0);
  combat.update(state, 1);
  assert.ok(squad.edgeProgress > 0);
});
