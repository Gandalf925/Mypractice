import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS,
  FRIENDLY_SQUAD_ORDER,
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchFriendlySquad,
  previewFriendlyDeployment
} from '../src/combat/friendly-force-system.js';
import { friendlySquadEnemyDamage } from '../src/combat/friendly-force-definitions.js';
import { EnemySystem } from '../src/combat/enemy-system.js';
import { CombatSystem } from '../src/combat/combat-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture(level = 4) {
  const state = createInitialState();
  state.civilization.level = level;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'field', x: 100, y: 0 },
      { id: 'enemy', x: 220, y: 0 }
    ],
    edges: [
      { id: 'road-a', a: 'home', b: 'field', length: 100, roadWidth: 5 },
      { id: 'road-b', a: 'field', b: 'enemy', length: 120, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', kind: 'MAJOR', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [{ id: 'field-base', name: '簡易拠点 1', kind: 'FIELD', status: 'ESTABLISHED', nodeId: 'field', x: 100, y: 0, hp: 40, maxHp: 40, establishedAt: 2 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 100, maxHp: 100, alive: true, level: 1, wavesSent: 0, spawnClock: 0 }];
  state.player.worldPosition = { x: 0, y: 0 };
  state.runtime.combatInitialized = true;
  for (const key of Object.keys(state.inventory.resources)) state.inventory.resources[key] = 999;
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

function stationedSquad(type, id, hp = null) {
  const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
  return {
    id, type, hp: hp ?? definition.hp, maxHp: definition.hp, members: definition.members,
    originBaseId: 'home-base', targetBaseId: 'enemy-base', missionTargetBaseId: 'enemy-base',
    nodeId: 'home', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    status: FRIENDLY_SQUAD_STATUS.HALTED, order: FRIENDLY_SQUAD_ORDER.HOLD,
    commandDestinationNodeId: 'home', travelHistoryNodeIds: ['home'], engagedEnemyId: null,
    attackClock: 0, combatCooldown: 0, departDelay: 0, deployedAt: 1
  };
}

test('friendly unit unlock levels and simple-base deployment restrictions are enforced', () => {
  const state = fixture(0);
  assert.equal(previewFriendlyDeployment(state, 'assault', 'home-base', 'enemy-base').ok, true);
  assert.match(previewFriendlyDeployment(state, 'skirmisher', 'home-base', 'enemy-base').reason, /文明Lv\.1/);
  state.civilization.level = 1;
  assert.equal(previewFriendlyDeployment(state, 'skirmisher', 'field-base', 'enemy-base').ok, true);
  state.civilization.level = 2;
  assert.equal(previewFriendlyDeployment(state, 'siege', 'field-base', 'enemy-base').ok, false);
  assert.equal(previewFriendlyDeployment(state, 'siege', 'home-base', 'enemy-base').ok, true);
  state.civilization.level = 3;
  assert.equal(previewFriendlyDeployment(state, 'heavy', 'field-base', 'enemy-base').ok, false);
  state.civilization.level = 4;
  assert.equal(previewFriendlyDeployment(state, 'expedition', 'home-base', 'enemy-base').ok, true);
});

test('skirmisher damage strongly favors light enemies and is weak against armored enemies', () => {
  const definition = FRIENDLY_SQUAD_DEFINITIONS.skirmisher;
  const light = friendlySquadEnemyDamage(definition, 'scout');
  const normal = friendlySquadEnemyDamage(definition, 'infantry');
  const armored = friendlySquadEnemyDamage(definition, 'ironclad');
  assert.ok(light > normal * 1.6);
  assert.ok(armored < normal * 0.6);
});

test('siege squad damages enemy bases much faster than the assault squad', () => {
  const assaultState = fixture(2);
  const assault = dispatchFriendlySquad(assaultState, 'assault', 'home-base', 'enemy-base').squad;
  assault.nodeId = 'enemy'; assault.path = { nodeIds: ['enemy'], edgeIds: [], targetId: 'enemy', cost: 0 }; assault.edgeId = null;
  new FriendlyForceSystem().update(assaultState, 1, { query: () => [], positions: new Map() });
  const assaultDamage = 100 - assaultState.world.enemyBases[0].hp;

  const siegeState = fixture(2);
  const siege = dispatchFriendlySquad(siegeState, 'siege', 'home-base', 'enemy-base').squad;
  siege.nodeId = 'enemy'; siege.path = { nodeIds: ['enemy'], edgeIds: [], targetId: 'enemy', cost: 0 }; siege.edgeId = null;
  new FriendlyForceSystem().update(siegeState, 1, { query: () => [], positions: new Map() });
  const siegeDamage = 100 - siegeState.world.enemyBases[0].hp;
  assert.ok(siegeDamage >= assaultDamage * 3);
});

test('nearby heavy squad intercepts part of the damage aimed at another friendly squad', () => {
  const state = fixture(3);
  const assault = stationedSquad('assault', 'assault');
  const heavy = stationedSquad('heavy', 'heavy');
  state.combat.friendlySquads = [assault, heavy];
  state.combat.enemies = [{
    id: 'attacker', type: 'infantry', level: 1, hp: 50, maxHp: 50, nodeId: 'home',
    path: null, pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 0.52,
    attackClock: 0, departDelay: 0, sourceBaseId: 'enemy-base', waveId: null,
    waveResolved: false, rewardGranted: false, reroutePending: false, routeBias: 1,
    targetDefenseId: null, targetFieldBaseId: null, notifiedDefenseIds: [], engagedSquadId: assault.id
  }];
  new EnemySystem(null).update(state, 1);
  const totalDps = Math.max(1, 8 * 0.32 + 2 * 0.22);
  const redirected = totalDps * FRIENDLY_SQUAD_DEFINITIONS.heavy.guardShare;
  assert.ok(Math.abs((assault.maxHp - assault.hp) - (totalDps - redirected)) < 0.001);
  assert.ok(Math.abs((heavy.maxHp - heavy.hp) - redirected) < 0.001);
});

test('expedition squad heals only after its non-combat recovery delay', () => {
  const state = fixture(4);
  const squad = stationedSquad('expedition', 'expedition', 200);
  squad.combatCooldown = FRIENDLY_SQUAD_DEFINITIONS.expedition.recoveryDelaySeconds;
  state.combat.friendlySquads = [squad];
  const system = new FriendlyForceSystem();
  const emptySpatial = { query: () => [], positions: new Map() };
  system.update(state, 5, emptySpatial);
  assert.equal(squad.hp, 200);
  system.update(state, 5, emptySpatial);
  assert.ok(squad.hp > 200);
  assert.ok(squad.hp <= squad.maxHp);
});

test('all friendly unit types preserve their identity and combat state through save and restore', () => {
  const state = fixture(4);
  state.combat.friendlySquads = Object.keys(FRIENDLY_SQUAD_DEFINITIONS).map((type, index) => {
    const squad = stationedSquad(type, `squad-${index}`, FRIENDLY_SQUAD_DEFINITIONS[type].hp - 10);
    squad.combatCooldown = index + 1;
    return squad;
  });
  const repository = new SaveRepository(new MemoryStorage(), 'unit-types');
  repository.save(state);
  const restored = repository.load();
  assert.deepEqual(restored.combat.friendlySquads.map(squad => squad.type), Object.keys(FRIENDLY_SQUAD_DEFINITIONS));
  assert.deepEqual(restored.combat.friendlySquads.map(squad => squad.combatCooldown), Object.keys(FRIENDLY_SQUAD_DEFINITIONS).map((_, index) => index + 1));
});

test('skirmisher prioritizes a light specialist over a nearer ordinary infantry target', () => {
  const state = fixture(1);
  const squad = stationedSquad('skirmisher', 'skirmisher');
  state.combat.friendlySquads = [squad];
  const infantry = { id: 'infantry', type: 'infantry', hp: 100, maxHp: 100, nodeId: 'home', departDelay: 0, rewardGranted: false };
  const raider = { id: 'raider', type: 'raider', hp: 100, maxHp: 100, nodeId: 'home', departDelay: 0, rewardGranted: false };
  state.combat.enemies = [infantry, raider];
  const spatial = {
    positions: new Map([['infantry', { x: 1, y: 0 }], ['raider', { x: 10, y: 0 }]]),
    query() {
      return [
        { enemy: infantry, position: { x: 1, y: 0 } },
        { enemy: raider, position: { x: 10, y: 0 } }
      ];
    }
  };
  new FriendlyForceSystem().update(state, 1, spatial);
  assert.equal(squad.engagedEnemyId, 'raider');
  assert.equal(infantry.hp, 100);
  assert.ok(raider.hp < 100);
});

test('mixed friendly unit types remain valid through extended regional combat simulation', () => {
  const state = fixture(7);
  state.world.enemyBases[0].hp = 5000;
  state.world.enemyBases[0].maxHp = 5000;
  state.world.playerBases = Object.keys(FRIENDLY_SQUAD_DEFINITIONS).map((type, index) => ({
    id: `major-${index}`, name: `主要拠点 ${index + 1}`, kind: 'MAJOR', status: 'ESTABLISHED',
    nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100, primary: index === 0, establishedAt: index + 1
  }));
  state.world.homeBase = { ...state.world.playerBases[0] };
  state.world.recoveryItems = [{
    id: 'stress-artifact', sourceBaseId: 'old-base', sourceBaseType: 'barracks', nodeId: 'enemy', x: 600, y: 0,
    artifactType: 'commandSeal', amount: 1, status: 'AVAILABLE', assignedSquadId: null, droppedAt: 1
  }];
  state.combat.enemyRegroupUntil = state.runtime.worldTimeMs + 300_000;
  for (const [index, type] of Object.keys(FRIENDLY_SQUAD_DEFINITIONS).entries()) {
    const targetId = type === 'retrieval' ? 'stress-artifact' : 'enemy-base';
    const result = dispatchFriendlySquad(state, type, `major-${index}`, targetId);
    assert.equal(result.ok, true, `${type} should deploy`);
  }
  state.combat.enemies = [
    { id: 'light', type: 'raider', level: 1, hp: 300, maxHp: 300, nodeId: 'field', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0, sourceBaseId: 'enemy-base', waveId: null, waveResolved: false, rewardGranted: false, reroutePending: false, routeBias: 1, targetDefenseId: null, targetFieldBaseId: null, notifiedDefenseIds: [], engagedSquadId: null },
    { id: 'armored', type: 'heavy', level: 2, hp: 500, maxHp: 500, nodeId: 'field', path: null, pathIndex: 0, edgeId: null, edgeProgress: 0, slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay: 0, sourceBaseId: 'enemy-base', waveId: null, waveResolved: false, rewardGranted: false, reroutePending: false, routeBias: 1, targetDefenseId: null, targetFieldBaseId: null, notifiedDefenseIds: [], engagedSquadId: null }
  ];
  const combat = new CombatSystem(null);
  for (let second = 0; second < 240; second += 1) combat.update(state, 1);
  for (const squad of state.combat.friendlySquads) {
    assert.ok(FRIENDLY_SQUAD_DEFINITIONS[squad.type]);
    assert.ok(Number.isFinite(squad.hp));
    assert.ok(squad.hp >= 0 && squad.hp <= squad.maxHp);
    assert.ok(Number.isFinite(squad.edgeProgress));
  }
  for (const enemy of state.combat.enemies) {
    assert.ok(Number.isFinite(enemy.hp));
    assert.ok(enemy.hp >= 0);
  }
  assert.ok(state.world.enemyBases[0].hp < state.world.enemyBases[0].maxHp);
});
