import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectCheckGuidance } from '../src/ui/civilization-ui.js';

const reportUrl = new URL('../docs/game-balance-user-journey-v0.33.4.json', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('the final user-journey audit passes without changing reference combat outcomes', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'));
  assert.equal(report.release, '0.33.4-balance-user-journey-audit');
  assert.equal(report.allChecksPassed, true);
  assert.equal(report.balanceRegression.earlyAndMidGame.gameplayMetricChanges.length, 0);
  assert.equal(report.balanceRegression.lateGame.gameplayMetricChanges.length, 0);
  assert.ok(report.openingProfiles.every(profile => profile.passed));
  assert.equal(report.progression.passed, true);
  assert.ok(report.fortifiedComparisons.every(item => item.passed));
});

test('civilization requirements provide actionable guidance for non-obvious goals', () => {
  assert.match(projectCheckGuidance({ kind: 'artifact', key: 'recoveredArtifacts', complete: false }, {}), /回収部隊/);
  assert.match(projectCheckGuidance({ kind: 'progress', key: 'perfectWaveStreak', complete: false }, {}), /突破されると/);
  assert.match(projectCheckGuidance({ kind: 'progress', key: 'cityHpStreak', threshold: 60, complete: false }, {}), /60以上/);
  assert.match(projectCheckGuidance({ kind: 'building', key: 'gate4', complete: false }, {}), /門/);
});

test('menu help explains manual single-squad routing and automatic coordinated routing', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /地図で派兵経路を指定/);
  assert.match(html, /最大2か所の経由地点/);
  assert.match(html, /連携出撃は各部隊の経路と出発時刻を自動調整/);
});

test('new-game completion message gives the first required defense and deployment actions', async () => {
  const source = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /まず投石台2基を建設し、敵拠点へ部隊を派兵/);
});

test('menu help matches the twenty-four-hour offline simulation limit', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const source = await readFile(new URL('../src/persistence/offline-simulator.js', import.meta.url), 'utf8');
  assert.match(html, /最大24時間まで計算/);
  assert.match(source, /maximumSeconds = 24 \* 60 \* 60/);
});

test('civilization UI does not expose internal English project status codes', async () => {
  const source = await readFile(new URL('../src/ui/civilization-ui.js', import.meta.url), 'utf8');
  assert.match(source, /AVAILABLE: '準備中'/);
  assert.match(source, /READY: '建設開始可能'/);
  assert.match(source, /BUILDING: '建設中'/);
  assert.doesNotMatch(source, /状態：\$\{project\.status\}/);
});
