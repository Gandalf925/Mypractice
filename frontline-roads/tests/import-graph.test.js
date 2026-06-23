import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src', import.meta.url));

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (extname(entry.name) === '.js') result.push(normalize(path));
  }
  return result;
}

function importsOf(source, file) {
  const result = [];
  const pattern = /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[1].startsWith('.')) continue;
    result.push(normalize(resolve(dirname(file), match[1])));
  }
  return result;
}

test('source module graph has no circular dependencies', async () => {
  const files = await collect(root);
  const graph = new Map();
  for (const file of files) graph.set(file, importsOf(await readFile(file, 'utf8'), file));

  const visiting = new Set();
  const visited = new Set();
  function visit(file, stack = []) {
    if (visiting.has(file)) {
      assert.fail(`Circular dependency: ${[...stack, relative(root, file)].join(' -> ')}`);
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) {
      if (graph.has(dependency)) visit(dependency, [...stack, relative(root, file)]);
    }
    visiting.delete(file);
    visited.add(file);
  }
  for (const file of files) visit(file);
});
