export async function cleanupLegacyPwa() {
  if (location.protocol !== 'https:') return { registrations: 0, caches: 0 };
  const gameScope = new URL('./', location.href).href;
  let registrations = 0;
  let cachesCleared = 0;
  try {
    if ('serviceWorker' in navigator) {
      const entries = await navigator.serviceWorker.getRegistrations();
      for (const registration of entries) {
        if (registration.scope === gameScope) {
          if (await registration.unregister()) registrations += 1;
        }
      }
    }
  } catch (error) {
    console.warn('Legacy service worker cleanup failed', error);
  }
  try {
    if ('caches' in globalThis) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.startsWith('frontline-roads')) {
          if (await caches.delete(key)) cachesCleared += 1;
        }
      }
    }
  } catch (error) {
    console.warn('Legacy cache cleanup failed', error);
  }
  return { registrations, caches: cachesCleared };
}
