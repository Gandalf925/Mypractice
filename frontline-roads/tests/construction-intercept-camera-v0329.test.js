import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import {
  FRIENDLY_SQUAD_MISSION,
  FRIENDLY_SQUAD_ORDER,
  FRIENDLY_SQUAD_STATUS,
  FriendlyForceSystem,
  dispatchFriendlySquad,
  previewFriendlyDeployment
} from '../src/combat/friendly-force-system.js';
import {
  MAJOR_BASE_BUILD_RANGES_METERS,
  FIELD_BASE_BUILD_RANGES_METERS,
  majorBaseBuildRange,
  fieldBaseBuildRange
} from '../src/base/construction-range.js';

function fixture() {
  const state = createInitialState();
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'intercept-test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'middle', x: 100, y: 0 },
      { id: 'front', x: 200, y: 0 }
    ],
    edges: [
      { id: 'home-middle', a: 'home', b: 'middle', length: 100, roadWidth: 5 },
      { id: 'middle-front', a: 'middle', b: 'front', length: 100, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', name: '本拠地', kind: 'MAJOR', primary: true, status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.world.enemyBases = [{ id: 'enemy-base', type: 'camp', nodeId: 'front', hp: 100, maxHp: 100, alive: true, level: 1 }];
  state.combat.enemies = [{
    id: 'moving-enemy', type: 'infantry', level: 1, hp: 50, maxHp: 50,
    nodeId: 'front', path: { nodeIds: ['front', 'middle', 'home'], edgeIds: ['middle-front', 'home-middle'], targetId: 'home', cost: 200 },
    pathIndex: 0, edgeId: 'middle-front', edgeProgress: 0, departDelay: 0,
    slowTimer: 0, slowMultiplier: 1, attackClock: 0, sourceBaseId: 'enemy-base',
    waveId: null, waveResolved: false, rewardGranted: false, reroutePending: false,
    routeBias: 1, targetDefenseId: null, targetFieldBaseId: null,
    notifiedDefenseIds: [], engagedSquadId: null
  }];
  Object.assign(state.inventory.resources, { wood: 500, stone: 500, fiber: 500, timber: 500, rope: 500 });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  state.runtime.combatInitialized = true;
  return state;
}

const emptySpatial = { query: () => [], positions: new Map() };

test('civilization build ranges use explicit bounded progression instead of exponential doubling', () => {
  assert.deepEqual(MAJOR_BASE_BUILD_RANGES_METERS, [85, 120, 160, 205, 255]);
  assert.deepEqual(FIELD_BASE_BUILD_RANGES_METERS, [50, 75, 105, 140, 180]);
  assert.equal(majorBaseBuildRange(4), 255);
  assert.equal(majorBaseBuildRange(99), 255);
  assert.equal(fieldBaseBuildRange(4), 180);
  assert.equal(fieldBaseBuildRange(99), 180);
});

test('an active enemy marker is a valid moving intercept deployment target', () => {
  const state = fixture();
  const preview = previewFriendlyDeployment(state, 'assault', 'home-base', 'moving-enemy', null, 'enemy');
  assert.equal(preview.ok, true);
  assert.equal(preview.targetKind, 'enemy');
  assert.equal(preview.missionType, FRIENDLY_SQUAD_MISSION.INTERCEPT);
  assert.equal(preview.path.targetId, 'middle');

  const result = dispatchFriendlySquad(state, 'assault', 'home-base', 'moving-enemy', null, 'enemy');
  assert.equal(result.ok, true);
  assert.equal(result.squad.targetEnemyId, 'moving-enemy');
  assert.equal(result.squad.targetBaseId, null);
  assert.equal(result.squad.missionType, FRIENDLY_SQUAD_MISSION.INTERCEPT);
  assert.equal(result.squad.commandDestinationNodeId, 'middle');
});

test('intercept squad replans to the selected enemy next road node and returns when the enemy is gone', () => {
  const state = fixture();
  const squad = dispatchFriendlySquad(state, 'assault', 'home-base', 'moving-enemy', null, 'enemy').squad;
  const enemy = state.combat.enemies[0];
  enemy.nodeId = 'middle';
  enemy.pathIndex = 1;
  enemy.edgeId = 'home-middle';
  enemy.edgeProgress = 0;

  const system = new FriendlyForceSystem();
  system.update(state, 0.1, emptySpatial);
  assert.equal(squad.commandDestinationNodeId, 'home');
  assert.equal(squad.missionType, FRIENDLY_SQUAD_MISSION.INTERCEPT);

  enemy.hp = 0;
  system.update(state, 0.1, emptySpatial);
  assert.equal(squad.order, FRIENDLY_SQUAD_ORDER.RETURN);
  assert.equal(squad.status, FRIENDLY_SQUAD_STATUS.RETURNING);
  assert.equal(squad.targetEnemyId, null);
});

test('gameplay HUD exposes independent zoom, selected-base and current-position camera controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  const baseUi = await readFile(new URL('../src/ui/base-command-ui.js', import.meta.url), 'utf8');
  for (const id of ['gameMapControls', 'gameZoomIn', 'gameZoomOut', 'focusSelectedBase', 'focusPlayer']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(bootstrap, /#focusSelectedBase/);
  assert.match(bootstrap, /baseCommandUi\.focusCurrentBase\(\)/);
  assert.match(bootstrap, /#focusPlayer/);
  assert.match(bootstrap, /this\.recenterMap\(\)/);
  assert.match(baseUi, /focusCurrentBase\(state = this\.store\.snapshot\(\)\)/);
});
