const RELEASE_ID = '0.28.4-ui-cache-correction';
const RELEASE_KEY = 'frontline_roads_asset_release';

function readReleaseMarker() {
  try { return globalThis.localStorage?.getItem(RELEASE_KEY) ?? null; }
  catch { return null; }
}

function writeReleaseMarker() {
  try { globalThis.localStorage?.setItem(RELEASE_KEY, RELEASE_ID); }
  catch { /* Storage may be unavailable; startup still continues. */ }
}

async function clearPreviousRelease() {
  const currentScopePath = new URL('./', globalThis.location.href).pathname;
  const registrations = await globalThis.navigator?.serviceWorker?.getRegistrations?.() ?? [];
  await Promise.all(registrations
    .filter(registration => {
      try { return new URL(registration.scope).pathname === currentScopePath; }
      catch { return false; }
    })
    .map(registration => registration.unregister()));
  const cacheNames = await globalThis.caches?.keys?.() ?? [];
  await Promise.all(cacheNames
    .filter(name => name.startsWith('frontline-roads-'))
    .map(name => globalThis.caches.delete(name)));
}

async function startCurrentRelease() {
  const url = new URL(globalThis.location.href);
  const refreshedUrl = url.searchParams.get('release') === '0.28.4';
  if (readReleaseMarker() !== RELEASE_ID && !refreshedUrl) {
    writeReleaseMarker();
    await clearPreviousRelease();
    url.searchParams.set('release', '0.28.4');
    globalThis.location.replace(url.toString());
    return;
  }
  await import('./bootstrap.js?v=0.28.4');
}

startCurrentRelease().catch(async error => {
  console.warn('Release refresh failed; starting current bundle directly.', error);
  await import('./bootstrap.js?v=0.28.4');
});
