export async function registerPwa({
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  globalRef = globalThis
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
    return await navigatorRef.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed', error);
    return null;
  }
}
