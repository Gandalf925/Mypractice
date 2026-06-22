self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('frontline-roads'))
        .map(name => caches.delete(name))
    );

    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();

    for (const windowClient of windows) {
      windowClient.navigate(windowClient.url);
    }
  })());
});
