import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesRecursively(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesRecursively(path));
    else if (entry.name.endsWith('.js')) result.push(path);
  }
  return result;
}

test('source contains no legacy function override pattern or duplicate fetchRoadGraph', async () => {
  const files = await filesRecursively(fileURLToPath(new URL('../src', import.meta.url)));
  let fetchRoadGraphCount = 0;
  let pointerOwnerCount = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    fetchRoadGraphCount += (source.match(/function\s+fetchRoadGraph\s*\(/g) ?? []).length;
    if (/addEventListener\(['"]pointerdown['"]/.test(source)) pointerOwnerCount += 1;
    assert.doesNotMatch(source, /(?:window|globalThis)\.[A-Za-z_$][\w$]*\s*=\s*function/);
    assert.doesNotMatch(source, /const\s+previous\w*\s*=\s*\w+;[\s\S]{0,120}\w+\s*=\s*function/);
  }
  assert.equal(fetchRoadGraphCount, 0);
  assert.equal(pointerOwnerCount, 1, 'Canvas pointer events must have one owner');
});

test('repair relay remains available as a build tool', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/ui/combat-ui.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /filter\(\(\[type\]\) => type !== ['"]relay['"]\)/);
});
