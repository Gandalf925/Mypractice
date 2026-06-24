import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInitialState } from '../src/core/state-schema.js';
import { attachGraphIndexes } from '../src/roads/road-graph.js';
import { BuildSystem } from '../src/combat/build-system.js';
import {
  constructionRangeMultiplier,
  majorBaseBuildRange,
  fieldBaseBuildRange,
  PLAYER_BUILD_RANGE_METERS
} from '../src/base/construction-range.js';

function rangeFixture(level = 0) {
  const state = createInitialState();
  state.civilization.level = level;
  state.world.roadGraph = attachGraphIndexes({
    center: { lat: 35, lon: 139 }, source: 'range-test', roadSpecVersion: 2,
    nodes: [
      { id: 'home', x: 0, y: 0 },
      { id: 'major-160', x: 160, y: 0 },
      { id: 'field', x: 500, y: 0 },
      { id: 'field-90', x: 590, y: 0 },
      { id: 'player', x: 1000, y: 0 },
      { id: 'player-84', x: 1084, y: 0 },
      { id: 'player-100', x: 1100, y: 0 }
    ],
    edges: [
      { id: 'a', a: 'home', b: 'major-160', length: 160, roadWidth: 5 },
      { id: 'b', a: 'major-160', b: 'field', length: 340, roadWidth: 5 },
      { id: 'c', a: 'field', b: 'field-90', length: 90, roadWidth: 5 },
      { id: 'd', a: 'field-90', b: 'player', length: 410, roadWidth: 5 },
      { id: 'e', a: 'player', b: 'player-84', length: 84, roadWidth: 5 },
      { id: 'f', a: 'player-84', b: 'player-100', length: 16, roadWidth: 5 }
    ]
  });
  state.world.homeBase = { id: 'home-base', name: '本拠地', status: 'ESTABLISHED', nodeId: 'home', x: 0, y: 0, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, primary: true }];
  state.world.fieldBases = [{ id: 'field-base', name: '簡易拠点 1', kind: 'FIELD', status: 'ESTABLISHED', nodeId: 'field', x: 500, y: 0, hp: 40, maxHp: 40 }];
  state.world.city = { nodeId: 'home', hp: 100, maxHp: 100 };
  state.player.worldPosition = { x: 1000, y: 0 };
  Object.assign(state.inventory.resources, { wood: 1000, stone: 1000, fiber: 1000 });
  state.inventory.capacity = { base: 5000, processed: 5000, ore: 5000, metal: 5000 };
  return state;
}

test('base construction ranges double at every civilization level while the current-position radius stays fixed', () => {
  const expected = [
    { level: 0, multiplier: 1, major: 85, field: 50 },
    { level: 1, multiplier: 2, major: 170, field: 100 },
    { level: 2, multiplier: 4, major: 340, field: 200 },
    { level: 3, multiplier: 8, major: 680, field: 400 },
    { level: 4, multiplier: 16, major: 1360, field: 800 }
  ];
  for (const row of expected) {
    assert.equal(constructionRangeMultiplier(row.level), row.multiplier);
    assert.equal(majorBaseBuildRange(row.level), row.major);
    assert.equal(fieldBaseBuildRange(row.level), row.field);
    const anchors = new BuildSystem().getBuildAnchors(rangeFixture(row.level));
    assert.equal(anchors.find(anchor => anchor.kind === 'MAJOR').range, row.major);
    assert.equal(anchors.find(anchor => anchor.kind === 'FIELD').range, row.field);
    assert.equal(anchors.find(anchor => anchor.kind === 'PLAYER').range, PLAYER_BUILD_RANGE_METERS);
  }
});

test('civilization advancement immediately unlocks road construction sites in the expanded base radius', () => {
  const build = new BuildSystem();
  const levelZero = rangeFixture(0);
  const levelOne = rangeFixture(1);
  const levelZeroSites = build.listBuildSites(levelZero, 'gun');
  const levelOneSites = build.listBuildSites(levelOne, 'gun');
  assert.equal(levelZeroSites.some(site => site.nodeId === 'major-160' && site.anchorKind === 'MAJOR'), false);
  assert.equal(levelOneSites.some(site => site.nodeId === 'major-160' && site.anchorKind === 'MAJOR'), true);
  assert.equal(levelOneSites.some(site => site.nodeId === 'field-90' && site.anchorKind === 'FIELD'), true);
});

test('civilization growth does not turn the player position into an unlimited mobile construction anchor', () => {
  const sites = new BuildSystem().listBuildSites(rangeFixture(4), 'gun');
  assert.equal(sites.some(site => site.nodeId === 'player-84' && site.anchorKind === 'PLAYER'), true);
  assert.equal(sites.some(site => site.nodeId === 'player-100' && site.anchorKind === 'PLAYER'), false);
});

test('build placement cache includes the actual anchor radius so a civilization level-up redraws sites', async () => {
  const source = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  assert.match(source, /Number\(anchor\.range\)\.toFixed\(0\)/);
  assert.match(source, /constructionRangeSummary/);
});

test('survey facility UI exposes manual retry and an observable successful connection record', async () => {
  const source = await readFile(new URL('../src/ui/combat-ui.js', import.meta.url), 'utf8');
  assert.match(source, /今すぐ測量/);
  assert.match(source, /LINK/);
  assert.match(source, /まだ道路サーバーとの通信成功記録がありません/);
  assert.match(source, /requestSurvey/);
});
