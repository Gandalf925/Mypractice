import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = relative => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

test('base placement uses a dedicated map viewport instead of drawing behind controls', async () => {
  const html = await read('index.html');
  const css = await read('src/styles/app.css');
  assert.match(html, /id=["']baseMapViewport["']/);
  assert.match(html, /MAP \/\/ ROAD SELECTION/);
  assert.match(css, /data-lifecycle=["']BASE_SELECTION["']\] #mapCanvas\s*\{[^}]*clip-path:\s*inset/s);
  assert.match(css, /#basePlacementOverlay \.panel\s*\{[^}]*grid-template-rows:/s);
  assert.match(css, /\.baseMapViewport\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /#basePlacementOverlay \.panelHeader,[\s\S]*background:[^;]*rgba\(2, 22, 18, 0\.995\)/);
});

test('base placement screen keeps the canvas clip synchronized with the viewport', async () => {
  const source = await read('src/ui/base-placement-screen.js');
  const bootstrap = await read('src/app/bootstrap.js');
  assert.match(source, /queryRequired\(['"]#baseMapViewport['"],\s*root\)/);
  assert.match(source, /getBoundingClientRect\(\)/);
  for (const property of ['--base-map-top', '--base-map-right', '--base-map-bottom', '--base-map-left']) {
    assert.match(source, new RegExp(property));
  }
  assert.match(source, /ResizeObserver/);
  assert.match(bootstrap, /this\.baseScreen\.destroy\(\)/);
});
