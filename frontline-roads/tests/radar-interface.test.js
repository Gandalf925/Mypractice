import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = relative => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

test('radar renderer is integrated without changing the map input owner', async () => {
  const renderer = await read('src/rendering/renderer.js');
  const radar = await read('src/rendering/radar-renderer.js');
  assert.match(renderer, /drawRadarBackdrop/);
  assert.match(renderer, /drawRadarOverlay/);
  assert.match(radar, /drawSweep/);
  assert.match(radar, /drawRings/);
  assert.doesNotMatch(radar, /addEventListener\(['"]pointer/);
});

test('radar theme exposes tactical palette and mobile layout rules', async () => {
  const css = await read('src/styles/app.css');
  assert.match(css, /--accent:\s*#65ffd0/);
  assert.match(css, /TACTICAL ROAD NETWORK/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /repeating-linear-gradient/);
});

test('combat and road renderers use radar glyphs and glow rather than emoji labels', async () => {
  const combat = await read('src/rendering/combat-renderer.js');
  const roads = await read('src/rendering/road-renderer.js');
  assert.match(combat, /drawEnemyBlip/);
  assert.match(combat, /sweepIntensity/);
  assert.doesNotMatch(combat, /ENEMY_DEFINITIONS|DEFENSE_DEFINITIONS/);
  assert.match(roads, /globalCompositeOperation = 'screen'/);
});

function mockGradient() {
  return { addColorStop() {} };
}

function mockContext() {
  return {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, translate() {}, rotate() {}, fillText() {},
    setLineDash() {}, clearRect() {}, createRadialGradient: mockGradient,
    set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set shadowColor(value) {},
    set shadowBlur(value) {}, set globalCompositeOperation(value) {}, set globalAlpha(value) {},
    set lineCap(value) {}, set lineJoin(value) {}, set font(value) {}, set textAlign(value) {}, set textBaseline(value) {}
  };
}

test('radar canvas layers render with a minimal canvas context', async () => {
  const { drawRadarBackdrop, drawRadarOverlay } = await import('../src/rendering/radar-renderer.js');
  const context = mockContext();
  assert.doesNotThrow(() => drawRadarBackdrop(context, 390, 844, { x: 195, y: 422 }, 1200));
  assert.doesNotThrow(() => drawRadarOverlay(context, 390, 844, 1200));
});

test('playing footer stays clear of the combat toolbar', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-lifecycle="PLAYING"\] footer\s*\{[^}]*bottom:\s*calc\(var\(--safe-bottom\) \+ 111px\)/s);
  assert.match(css, /orientation:\s*landscape[\s\S]*html\[data-lifecycle="PLAYING"\] footer\s*\{\s*display:\s*none;/);
});
