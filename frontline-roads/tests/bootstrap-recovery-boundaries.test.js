import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');

test('startup quarantines only validation failures and isolates optional cache restoration', () => {
  assert.match(source, /restoreValidatedSave\(saved\)/);
  assert.match(source, /try \{\s*this\.restoreValidatedSave\(saved\);\s*\} catch \(error\) \{[\s\S]*resetAfterInvalidSave\(\)/);
  assert.match(source, /try \{\s*await this\.roadWorld\.restoreCachedChunks\(\);\s*\} catch \(error\) \{[\s\S]*道路キャッシュを復元できませんでした/);
  const quarantineCalls = [...source.matchAll(/quarantineCurrent\(/g)];
  assert.equal(quarantineCalls.length, 1);
});

test('offline restoration has an explicit rollback boundary and UI failure preserves the save', () => {
  assert.match(source, /const beforeOffline = this\.store\.snapshot\(\)/);
  assert.match(source, /this\.store\.replace\(beforeOffline, 'offline:rollback'\)/);
  assert.match(source, /catch \(error\) \{\s*console\.error\('Saved game UI startup failed'/);
  assert.doesNotMatch(source, /Saved game UI startup failed[\s\S]{0,500}quarantineCurrent/);
});

test('complete reset cancels road-world requests before deleting cached world data', () => {
  const reset = source.match(/async reset\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(reset.indexOf('this.roadWorld.abort()') >= 0);
  assert.ok(reset.indexOf('this.roadWorld.abort()') < reset.indexOf('await this.roadWorld.clearCurrentWorld()'));
});
