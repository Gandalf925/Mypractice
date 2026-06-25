import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reportUrl = new URL('../docs/playtest-civilization-v0.33.0.json', import.meta.url);

test('late civilization balance report covers every level and defense profile', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'));
  assert.equal(report.release, '0.33.0-civilization-road-federation');
  assert.equal(report.allChecksPassed, true);
  assert.equal(report.scenarios.length, 9);

  for (const level of [5, 6, 7]) {
    const scenarios = report.scenarios.filter(item => item.civilizationLevel === level);
    assert.deepEqual(new Set(scenarios.map(item => item.defenseProfile)), new Set(['underbuilt', 'standard', 'fortified']));
    assert.ok(scenarios.every(item => item.passed));
    const standard = scenarios.find(item => item.defenseProfile === 'standard');
    assert.equal(standard.cityDefeats, 0);
    assert.ok(standard.destroyedDefenses >= 1);
  }

  const levelSeven = report.scenarios.find(item => item.profile === 'standard-civ7');
  assert.ok(levelSeven.peakMovingEnemies >= 500);
  assert.ok(levelSeven.averageMovingEnemies >= 300);
});
