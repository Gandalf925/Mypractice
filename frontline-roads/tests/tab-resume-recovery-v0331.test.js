import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrap = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const constants = await readFile(new URL('../src/core/constants.js', import.meta.url), 'utf8');

test('tab return never destroys the live application from pagehide', () => {
  assert.match(bootstrap, /globalThis\.addEventListener\?\.\('pagehide', \(\) => app\.handlePageHide\(\)\)/);
  assert.doesNotMatch(bootstrap, /pagehide[\s\S]{0,180}app\.destroy\(\)/);
  assert.match(bootstrap, /document\.addEventListener\('freeze', \(\) => app\.handlePageHide\(\)\)/);
});

test('visible-tab recovery refreshes ownership and restores the established-game UI', () => {
  const visibility = bootstrap.match(/handleVisibilityChange\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(visibility, /this\.tabCoordinator\.refresh\(\)/);
  assert.match(visibility, /this\.restoreEstablishedGameUi\(\)/);
  assert.match(bootstrap, /this\.baseScreen\.hide\(\)/);
  assert.match(bootstrap, /setVisible\(queryRequired\('#playingHud'\), true\)/);
  assert.match(bootstrap, /if \(!event\.persisted && !document\.wasDiscarded\) return/);
});

test('service worker serves installed application assets before background refresh', () => {
  const assetHandler = serviceWorker.match(/async function serveApplicationAsset\(request, event\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.ok(assetHandler.indexOf('cache.match') >= 0);
  assert.ok(assetHandler.indexOf('cache.match') < assetHandler.indexOf('refreshAsset'));
  assert.match(assetHandler, /caches\.open\(CACHE_NAME\)/);
  assert.doesNotMatch(assetHandler, /ignoreSearch: true/);
  assert.match(serviceWorker, /requestedVersion && requestedVersion !== RELEASE_VERSION/);
  assert.match(assetHandler, /event\.waitUntil\(refreshAsset\(request\)\)/);
});

test('network and boot waits are bounded and recovery does not delete the save', () => {
  assert.match(serviceWorker, /const NETWORK_TIMEOUT_MS = 4500/);
  assert.match(serviceWorker, /controller\.abort\(\)/);
  assert.match(html, /withTimeout\(import\(url\.href\), 7000, 'Application module'\)/);
  assert.match(html, /__FRONTLINE_BOOT_TIMER__/);
  assert.match(html, /保存済みゲームを再読み込み/);
  assert.doesNotMatch(html, /localStorage\.clear|removeItem\(.*frontline_roads_refactor_v2/);
  assert.match(constants, /SAVE_KEY = 'frontline_roads_refactor_v2'/);
});
