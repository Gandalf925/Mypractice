import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

async function filesRecursively(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesRecursively(path));
    else result.push(path);
  }
  return result;
}

test('HTML references only existing local app resources and required controls exist', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  for (const id of ['mapCanvas', 'confirmBase', 'retryLocation', 'playingHud', 'combatTools', 'civilizationPanel', 'menuPanel', 'contextPanel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  const references = [...html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map(match => match[1]);
  for (const reference of references) await access(resolve(root, reference.slice(2)));
});

test('every required DOM id used by bootstrap exists in HTML', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const source = await readFile(resolve(root, 'src/app/bootstrap.js'), 'utf8');
  const ids = new Set([...source.matchAll(/queryRequired\(['"]#([^'"]+)['"]\)/g)].map(match => match[1]));
  assert.ok(ids.size > 0);
  for (const id of ids) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing #${id}`);
});

test('service worker app shell contains every runtime source file and all paths exist', async () => {
  const source = await readFile(resolve(root, 'sw.js'), 'utf8');
  const paths = new Set([...source.matchAll(/'\.\/([^']*)'/g)].map(match => match[1]).filter(Boolean));
  for (const path of paths) await access(resolve(root, path));

  const runtimeFiles = (await filesRecursively(resolve(root, 'src')))
    .filter(path => path.endsWith('.js') || path.endsWith('.css'))
    .map(path => relative(root, path).replaceAll('\\', '/'));
  for (const path of runtimeFiles) assert.ok(paths.has(path), `Service worker is missing ${path}`);
});

test('development tree has no premature single-HTML build output', async () => {
  const packageSource = await readFile(resolve(root, 'package.json'), 'utf8');
  assert.doesNotMatch(packageSource, /single[-_ ]?html|bundle|dist/i);
});


test('service worker only deletes FRONTLINE ROADS caches', async () => {
  const source = await readFile(resolve(root, 'sw.js'), 'utf8');
  assert.match(source, /const CACHE_PREFIX = ['"]frontline-roads-/);
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(source, /keys\.filter\(key => key !== CACHE_NAME\)/);
});

test('service worker falls back to HTML only for navigation requests', async () => {
  const source = await readFile(resolve(root, 'sw.js'), 'utf8');
  assert.match(source, /event\.request\.mode === ['"]navigate['"]/);
  assert.match(source, /return Response\.error\(\)/);
});

test('release version is synchronized across package, runtime label, HTML loader and service-worker cache', async () => {
  const packageData = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const constants = await readFile(resolve(root, 'src/core/constants.js'), 'utf8');
  const serviceWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const runtimeVersion = constants.match(/APP_VERSION = ['"]([^'"]+)['"]/u)?.[1];
  assert.ok(runtimeVersion?.startsWith(`${packageData.version}-`));
  assert.match(serviceWorker, new RegExp(`v${runtimeVersion.replaceAll('.', '-').replaceAll('_', '-')}`));
  assert.match(html, new RegExp(`version: ['"]${packageData.version}['"]`));
  assert.match(html, /bootstrap\.js/);
});

test('asset startup does not delete caches or unregister service workers before boot', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /caches\.delete|unregister\s*\(/);
  assert.match(html, /__FRONTLINE_STYLES_READY__/);
  assert.match(html, /await globalThis\.__FRONTLINE_STYLES_READY__/);
  assert.match(html, /release\.directory}\/src\/styles\/app\.css/);
  assert.match(html, /release\.directory}\/src\/app\/bootstrap\.js/);
});

test('GitHub Pages package includes no-Jekyll markers and the legacy fr redirect', async () => {
  await access(resolve(root, '.nojekyll'));
  await access(resolve(root, '..', '.nojekyll'));
  const alias = await readFile(resolve(root, '..', 'fr', 'index.html'), 'utf8');
  const packageData = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.ok(alias.includes(`../frontline-roads/?entry=${packageData.version}`));
});


test('obsolete top alert frame is absent from the play HUD', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /id=["']threatStatus["']/);
  assert.doesNotMatch(html, />ALERT</);
});
