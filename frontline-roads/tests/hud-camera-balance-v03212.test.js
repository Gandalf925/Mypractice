import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('gameplay camera controls are part of the HUD grid instead of overlaying the tactical map', async () => {
  const html = await read('../index.html');
  const css = await read('../src/styles/app.css');
  const headerStart = html.indexOf('<div class="hudHeader">');
  const headerEnd = html.indexOf('</div>\n      <aside id="contextPanel"', headerStart);
  const controls = html.indexOf('id="gameMapControls"', headerStart);
  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  assert.ok(controls > headerStart && controls < headerEnd, 'camera controls must be nested inside the HUD header');
  assert.doesNotMatch(html, /id="gameMapControls" class="[^"]*\bmapControls\b/);
  assert.match(css, /"summary navigation"/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?"summary navigation"/);
  assert.match(css, /\.gameMapControls\s*\{[^}]*grid-area:\s*navigation;[^}]*position:\s*static;/s);
  assert.doesNotMatch(css, /\.gameMapControls\s*\{[^}]*bottom:\s*calc\(/s);
  assert.match(css, /\.gameMapControls button\s*\{[^}]*width:\s*32px;[^}]*height:\s*30px;/s);
});

test('deterministic civilization pressure playtest passes every declared balance check', async () => {
  const report = JSON.parse(await read('../docs/playtest-balance-v0.32.12.json'));
  assert.equal(report.release, '0.32.12-hud-camera-balance-validation');
  assert.equal(report.allChecksPassed, true);
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.scenarios.every(scenario => scenario.passed));

  const byName = new Map(report.scenarios.map(scenario => [scenario.profile, scenario]));
  assert.ok(byName.get('standard-civ1').peakEnemies >= 20);
  assert.ok(byName.get('standard-civ2').peakEnemies >= 60);
  assert.ok(byName.get('standard-civ3').peakEnemies >= 150);
  assert.ok(byName.get('standard-civ4').peakEnemies >= 280);
  assert.equal(byName.get('standard-civ4').cityDefeats, 0);
  assert.ok(byName.get('underbuilt-civ3').destroyedDefenses >= 8);
  assert.ok(byName.get('underbuilt-civ4').cityDefeats >= 1);
  assert.ok(byName.get('fortified-civ4').destroyedDefenses <= 4);
});
