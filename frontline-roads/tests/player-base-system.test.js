import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  PLAYER_BASE_MINIMUM_SEPARATION_METERS,
  activePlayerBases,
  baseLimitForCivilization,
  playerBasePlacementCost
} from '../src/base/player-bases.js';
import { PlayerBaseSystem, previewPlayerBasePlacement } from '../src/base/player-base-system.js';
import { BuildSystem } from '../src/combat/build-system.js';
import { regionActivityAtPoint, REGION_ACTIVITY } from '../src/combat/region-activity.js';
import { evaluateProject } from '../src/civilization/progression-system.js';
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
      { id: 'near-home', x: PLAYER_BASE_MINIMUM_SEPARATION_METERS - 1, y: 0 },
      { id: 'remote', x: 400, y: 0 },
      { id: 'remote-build', x: 450, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'near-home', length: PLAYER_BASE_MINIMUM_SEPARATION_METERS - 1, roadWidth: 5 },
      { id: 'b', a: 'near-home', b: 'remote', length: 181, roadWidth: 5 },
      { id: 'c', a: 'remote', b: 'remote-build', length: 50, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, establishedAt: 1 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.runtime.combatInitialized = true;
  state.player.locationAccuracy = 10;
  Object.assign(state.inventory.resources, { timber: 100, rope: 100, cutStone: 100, bronzeIngot: 100, wroughtIron: 100 });
  state.inventory.capacity = { base: 1000, processed: 1000, ore: 1000, metal: 1000 };
  return state;
}

test('civilization level increases the active player-base limit by one', () => {
  assert.equal(baseLimitForCivilization(0), 1);
  assert.equal(baseLimitForCivilization(1), 2);
  assert.equal(baseLimitForCivilization(4), 5);
});

test('base placement requires an unlocked slot, fresh position, nearby road and minimum separation', () => {
  const state = fixture();
  const now = 100_000;
  state.player.worldPosition = { x: 400, y: 0 };
  state.player.locationUpdatedAt = now;
  assert.match(previewPlayerBasePlacement(state, now).reason, /1個まで/);
  state.civilization.level = 1;
  state.player.locationUpdatedAt = now - 301_000;
  assert.match(previewPlayerBasePlacement(state, now).reason, /位置情報が古い/);
  state.player.locationUpdatedAt = now;
  state.player.worldPosition = { x: 1000, y: 1000 };
  assert.match(previewPlayerBasePlacement(state, now).reason, /取得済み道路/);
  state.player.worldPosition = { x: PLAYER_BASE_MINIMUM_SEPARATION_METERS - 1, y: 0 };
  assert.match(previewPlayerBasePlacement(state, now).reason, /220m以上/);
  state.player.worldPosition = { x: 400, y: 0 };
  assert.equal(previewPlayerBasePlacement(state, now).ok, true);
});


test('additional major bases require and consume escalating processed-resource costs', () => {
  const state = fixture();
  const now = 100_000;
  state.civilization.level = 1;
  state.player.worldPosition = { x: 400, y: 0 };
  state.player.locationUpdatedAt = now;
  const cost = playerBasePlacementCost(state);
  assert.deepEqual(cost, { timber: 8, rope: 4, cutStone: 8 });
  Object.assign(state.inventory.resources, { timber: 0, rope: 0, cutStone: 0 });
  const blocked = previewPlayerBasePlacement(state, now);
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.missing, cost);
  Object.assign(state.inventory.resources, cost);
  const result = new PlayerBaseSystem().establishAtCurrentLocation(state, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cost, cost);
  assert.deepEqual(
    { timber: state.inventory.resources.timber, rope: state.inventory.resources.rope, cutStone: state.inventory.resources.cutStone },
    { timber: 0, rope: 0, cutStone: 0 }
  );
});

test('establishing a base adds a remote construction and simulation anchor', () => {
  const state = fixture();
  const now = 100_000;
  state.civilization.level = 1;
  state.player.worldPosition = { x: 400, y: 0 };
  state.player.locationUpdatedAt = now;
  const result = new PlayerBaseSystem().establishAtCurrentLocation(state, now);
  assert.equal(result.ok, true);
  assert.equal(activePlayerBases(state).length, 2);
  assert.equal(result.base.nodeId, 'remote');
  assert.equal(result.base.primary, false);
  const sites = new BuildSystem(null).listBuildSites(state, 'gun');
  assert.ok(sites.some(site => site.nodeId === 'remote-build' && site.anchorId === `base:${result.base.id}`));
  state.player.worldPosition = null;
  assert.equal(regionActivityAtPoint(state, { x: 1200, y: 0 }), REGION_ACTIVITY.ACTIVE);
});

test('secondary bases survive save and restore without retaining exact location fields', () => {
  const state = fixture();
  state.civilization.level = 1;
  state.player.worldPosition = { x: 400, y: 0 };
  state.player.locationUpdatedAt = 100_000;
  const base = new PlayerBaseSystem().establishAtCurrentLocation(state, 100_000).base;
  base.location = { lat: 35.123456, lon: 139.123456 };
  const storage = new MemoryStorage();
  const repository = new SaveRepository(storage, 'bases-test');
  repository.save(state);
  assert.equal(storage.getItem('bases-test').includes('35.123456'), false);
  const restored = repository.load();
  assert.equal(restored.world.playerBases.length, 2);
  assert.equal(restored.world.playerBases[1].nodeId, 'remote');
});

test('civilization projects require cumulative artifacts recovered in the field', () => {
  const state = fixture();
  const first = evaluateProject(state);
  const artifactCheck = first.checks.find(check => check.kind === 'artifact');
  assert.deepEqual({ current: artifactCheck.current, required: artifactCheck.required, complete: artifactCheck.complete }, { current: 0, required: 1, complete: false });
  state.civilization.totalArtifactsRecovered = 1;
  const completedArtifactCheck = evaluateProject(state).checks.find(check => check.kind === 'artifact');
  assert.equal(completedArtifactCheck.complete, true);
});
