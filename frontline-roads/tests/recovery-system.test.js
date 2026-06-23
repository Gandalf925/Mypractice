import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { destroyEnemyBase } from '../src/combat/enemy-base-system.js';
import {
  RECOVERY_RANGE_METERS,
  RECOVERY_COLLECTION_DURATION_SECONDS,
  RecoverySystem,
  recoveryEligibility
} from '../src/exploration/recovery-system.js';
import { SaveRepository } from '../src/persistence/save-repository.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'enemy', x: 100, y: 0 }
    ],
    edges: [{ id: 'road', a: 'home', b: 'enemy', length: 100, roadWidth: 5 }]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{
    id: 'enemy-base', type: 'barracks', nodeId: 'enemy', hp: 0, maxHp: 30,
    alive: true, level: 1, spawnClock: 0, wavesSent: 0
  }];
  state.runtime.combatInitialized = true;
  return state;
}

function destroyAndGetItem(state) {
  const base = state.world.enemyBases[0];
  assert.equal(destroyEnemyBase(state, base), true);
  assert.equal(state.world.recoveryItems.length, 1);
  return state.world.recoveryItems[0];
}

test('destroying an enemy base creates one persistent recovery item at the destroyed base', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  assert.equal(item.status, 'AVAILABLE');
  assert.equal(item.nodeId, 'enemy');
  assert.equal(item.x, 100);
  assert.equal(item.y, 0);
  assert.equal(item.artifactType, 'commandSeal');
  assert.equal(destroyEnemyBase(state, state.world.enemyBases[0]), false);
  assert.equal(state.world.recoveryItems.length, 1);
});

test('recovery requires the player to be within the physical collection range', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  const now = 100_000;
  state.player.worldPosition = { x: 100 + RECOVERY_RANGE_METERS + 1, y: 0 };
  state.player.locationUpdatedAt = now;
  state.player.locationAccuracy = 10;
  const result = new RecoverySystem().beginCollection(state, item.id, now);
  assert.equal(result.ok, false);
  assert.match(result.reason, /40m以内/);
  assert.equal(item.status, 'AVAILABLE');
});

test('recovery rejects stale or inaccurate geolocation even at the item position', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  const now = 100_000;
  state.player.worldPosition = { x: 100, y: 0 };
  state.player.locationUpdatedAt = now - 61_000;
  state.player.locationAccuracy = 10;
  assert.match(recoveryEligibility(state, item, now).reason, /位置情報が古い/);
  state.player.locationUpdatedAt = now;
  state.player.locationAccuracy = 101;
  assert.match(recoveryEligibility(state, item, now).reason, /精度/);
});

test('manual collection requires five seconds in range, grants once and removes the recovered item', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  const now = Date.now();
  state.player.worldPosition = { x: 100, y: 0 };
  state.player.locationUpdatedAt = now;
  state.player.locationAccuracy = 12;
  const system = new RecoverySystem();
  const first = system.beginCollection(state, item.id, now);
  assert.equal(first.ok, true);
  assert.equal(state.civilization.totalArtifactsRecovered, 0);
  system.update(state, RECOVERY_COLLECTION_DURATION_SECONDS - 0.1, now + 1000);
  assert.equal(state.world.recoveryItems.length, 1);
  const completed = system.update(state, 0.1, now + 2000);
  assert.equal(completed.ok, true);
  assert.equal(state.world.recoveryItems.length, 0);
  assert.equal(state.world.recoveryCollection, null);
  assert.equal(state.civilization.artifacts.commandSeal, 1);
  assert.equal(state.civilization.totalArtifactsRecovered, 1);
  const second = system.beginCollection(state, item.id, now + 2001);
  assert.equal(second.ok, false);
  assert.equal(state.civilization.artifacts.commandSeal, 1);
});

test('leaving the collection radius cancels progress without removing the item', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  const now = Date.now();
  state.player.worldPosition = { x: 100, y: 0 };
  state.player.locationUpdatedAt = now;
  state.player.locationAccuracy = 10;
  const system = new RecoverySystem();
  assert.equal(system.beginCollection(state, item.id, now).ok, true);
  system.update(state, 2, now + 1000);
  state.player.worldPosition = { x: 200, y: 0 };
  const cancelled = system.update(state, 1, now + 2000);
  assert.equal(cancelled.cancelled, true);
  assert.equal(state.world.recoveryCollection, null);
  assert.equal(state.world.recoveryItems.length, 1);
  assert.equal(state.civilization.totalArtifactsRecovered, 0);
});

test('uncollected recovery items survive save and restore while live location freshness does not', () => {
  const state = fixture();
  const item = destroyAndGetItem(state);
  state.player.currentPosition = { lat: 35.123456, lon: 139.123456 };
  state.player.worldPosition = { x: 100, y: 0 };
  state.player.locationUpdatedAt = Date.now();
  state.player.locationAccuracy = 8;
  new RecoverySystem().beginCollection(state, item.id, state.player.locationUpdatedAt);
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'recovery-test');
  repository.save(state);
  const restored = repository.load();
  assert.equal(restored.world.recoveryItems.length, 1);
  assert.equal(restored.world.recoveryItems[0].id, item.id);
  assert.equal(restored.world.recoveryItems[0].status, 'AVAILABLE');
  assert.equal(restored.player.currentPosition, null);
  assert.equal(restored.player.locationUpdatedAt, null);
  assert.equal(restored.player.locationAccuracy, null);
  assert.equal(restored.world.recoveryCollection, null);
});
