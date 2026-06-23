import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('HUD and modal CSS do not use unreadably small explicit type', async () => {
  const css = await readFile(resolve(root, 'src/styles/app.css'), 'utf8');
  const sizes = [...css.matchAll(/font-size\s*:\s*(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length > 0);
  assert.ok(Math.min(...sizes) >= 8, `Minimum CSS font size is ${Math.min(...sizes)}px`);
});

test('Canvas labels retain a readable minimum without changing world scale', async () => {
  const files = [
    'src/rendering/combat-renderer.js',
    'src/rendering/radar-renderer.js',
    'src/rendering/tactical-overlay.js',
    'src/rendering/frontier-renderer.js',
    'src/rendering/exploration-renderer.js',
  ];
  const sizes = [];
  for (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    sizes.push(...[...source.matchAll(/(?:font\s*=\s*['"][^'"]*?)(\d+)px/g)].map(match => Number(match[1])));
  }
  assert.ok(sizes.length > 0);
  assert.ok(Math.min(...sizes) >= 7, `Minimum Canvas font size is ${Math.min(...sizes)}px`);
});

test('larger tool labels receive matching control height and context clearance', async () => {
  const css = await readFile(resolve(root, 'src/styles/app.css'), 'utf8');
  assert.match(css, /\.toolButton[\s\S]*?height:\s*78px/);
  assert.match(css, /\.contextPanel[\s\S]*?bottom:\s*calc\(var\(--safe-bottom\) \+ 105px\)/);
});
