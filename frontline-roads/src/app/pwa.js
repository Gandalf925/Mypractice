export async function registerPwa({
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  globalRef = globalThis,
  moduleUrl = import.meta.url
} = {}) {
  const hostname = locationRef?.hostname ?? '';
  const protocol = locationRef?.protocol ?? '';
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const fixtureRequested = new URLSearchParams(locationRef?.search ?? '').get('devFixture') === '1';
  const fixtureAllowed = localHost || protocol === 'file:' || globalRef.__FRONTLINE_TEST_FIXTURE__ === true;
  if (fixtureRequested && fixtureAllowed) return null;
  if (!navigatorRef?.serviceWorker?.register) return null;
  if (protocol !== 'https:' && !localHost) return null;
  try {
    if (globalRef.__FRONTLINE_SW_READY__?.then) return await globalRef.__FRONTLINE_SW_READY__;
    const appRoot = new URL('../../', moduleUrl);
    const workerUrl = new URL('sw.js', appRoot);
    const releaseVersion = globalRef.__FRONTLINE_RELEASE__?.version ?? '0.33.4';
    workerUrl.searchParams.set('v', releaseVersion);
    const reloadKey = `frontline-sw-reload:${releaseVersion}`;
    navigatorRef.serviceWorker.addEventListener?.('controllerchange', () => {
      try {
        if (globalRef.sessionStorage?.getItem(reloadKey) === '1') return;
        globalRef.sessionStorage?.setItem(reloadKey, '1');
        locationRef.reload?.();
      } catch {
        locationRef.reload?.();
      }
    }, { once: true });
    const registration = await navigatorRef.serviceWorker.register(workerUrl.href, { scope: appRoot.href, updateViaCache: 'none' });
    await registration.update?.().catch?.(() => {});
    return registration;
  } catch (error) {
    console.warn('Service worker registration failed', error);
    return null;
  }
}
