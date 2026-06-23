import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { ensureCivilizationState } from '../src/civilization/civilization-system.js';
import { deliverRecoveryItem, markRecoveryItemCarried, reserveRecoveryItem } from '../src/exploration/recovery-system.js';
import {
  destroyEnemyBase,
  RESOURCE_BASE_RESPAWN_MIN_SECONDS,
  RESOURCE_BASE_RESPAWN_MAX_SECONDS,
  BASE_RESPAWN_MIN_SECONDS
} from '../src/combat/enemy-base-system.js';

function stateFixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [{ id: 'home', x: 0, y: 0 }, { id: 'camp', x: 400, y: 0 }],
    edges: [{ id: 'road', a: 'home', b: 'camp', length: 400 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0 };
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [];
  state.runtime.worldTimeMs = 1_000_000;
  state.civilization.level = 2;
  ensureCivilizationState(state, { initializeInventory: true });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

test('destroying a resource enemy base secures its declared reward in one recoverable cache', () => {
  const state = stateFixture();
  const base = { id: 'copper-1', type: 'copperCamp', nodeId: 'camp', hp: 0, maxHp: 120, alive: true };
  state.world.enemyBases.push(base);
  const before = state.inventory.resources.copperOre;
  const beforeStone = state.inventory.resources.stone;
  assert.equal(destroyEnemyBase(state, base), true);
  assert.equal(state.inventory.resources.copperOre, before);
  assert.equal(state.world.recoveryItems.length, 1);
  assert.deepEqual(state.world.recoveryItems[0].loot, { copperOre: 120, stone: 20 });
  assert.equal(destroyEnemyBase(state, base), false);
  assert.equal(state.world.recoveryItems.length, 1);
  const item = state.world.recoveryItems[0];
  state.combat.friendlySquads.push({ id: 'squad', hp: 1 });
  assert.equal(reserveRecoveryItem(state, item.id, 'squad').ok, true);
  assert.equal(markRecoveryItemCarried(state, item.id, 'squad').ok, true);
  assert.equal(deliverRecoveryItem(state, item.id, 'squad').ok, true);
  assert.equal(state.inventory.resources.copperOre, before + 120);
  assert.equal(state.inventory.resources.stone, beforeStone + 20);
});

test('resource enemy bases return within the progression window while strategic bases retain long recovery', () => {
  const state = stateFixture();
  const resource = { id: 'tin-1', type: 'tinCamp', nodeId: 'camp', hp: 0, maxHp: 120, alive: true };
  state.world.enemyBases.push(resource);
  destroyEnemyBase(state, resource);
  const resourceTimer = state.world.baseRespawns[0].remainingSec;
  assert.ok(resourceTimer >= RESOURCE_BASE_RESPAWN_MIN_SECONDS);
  assert.ok(resourceTimer <= RESOURCE_BASE_RESPAWN_MAX_SECONDS);
  state.world.baseRespawns = [];
  const normal = { id: 'barracks-1', type: 'barracks', nodeId: 'camp', hp: 0, maxHp: 100, alive: true };
  state.world.enemyBases.push(normal);
  destroyEnemyBase(state, normal);
  assert.ok(state.world.baseRespawns[0].remainingSec >= BASE_RESPAWN_MIN_SECONDS);
});

test('legacy resource-outpost data is stripped during runtime normalization', () => {
  const state = stateFixture();
  state.world.outposts = [{ id: 'legacy-outpost' }];
  ensureCivilizationState(state);
  assert.equal('outposts' in state.world, false);
});
