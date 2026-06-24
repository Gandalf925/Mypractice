'use strict';
const CACHE_PREFIX = 'frontline-roads-';
const CACHE_NAME = `${CACHE_PREFIX}v0-32-2-collapse-recovery-balance`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './src/app/bootstrap.js',
  './src/app/development-fixture.js',
  './src/app/game-loop.js',
  './src/app/performance-profile.js',
  './src/app/lifecycle.js',
  './src/app/pwa.js',
  './src/base/base-graph.js',
  './src/base/base-placement-service.js',
  './src/base/base-state.js',
  './src/base/field-bases.js',
  './src/base/field-base-system.js',
  './src/base/player-bases.js',
  './src/base/player-base-system.js',
  './src/civilization/civilization-system.js',
  './src/civilization/data.js',
  './src/civilization/defense-upgrade.js',
  './src/civilization/inventory-system.js',
  './src/civilization/production-system.js',
  './src/civilization/progression-system.js',
  './src/civilization/repair-cost.js',
  './src/civilization/settlement-system.js',
  './src/combat/build-system.js',
  './src/combat/combat-geometry.js',
  './src/combat/combat-initializer.js',
  './src/combat/combat-system.js',
  './src/combat/combat-spatial-index.js',
  './src/combat/defense-system.js',
  './src/combat/defense-presentation.js',
  './src/combat/definitions.js',
  './src/combat/enemy-system.js',
  './src/combat/enemy-scaling.js',
  './src/combat/enemy-base-system.js',
  './src/combat/enemy-base-placement.js',
  './src/combat/enemy-personalities.js',
  './src/combat/friendly-force-definitions.js',
  './src/combat/friendly-recovery-system.js',
  './src/combat/friendly-force-system.js',
  './src/combat/friendly-route-planner.js',
  './src/combat/road-unit-position.js',
  './src/combat/region-activity.js',
  './src/combat/routing-system.js',
  './src/combat/wave-system.js',
  './src/core/constants.js',
  './src/core/errors.js',
  './src/core/recovery-balance.js',
  './src/core/event-bus.js',
  './src/core/state-schema.js',
  './src/core/state-store.js',
  './src/core/runtime-state.js',
  './src/core/state-normalizer.js',
  './src/core/utilities.js',
  './src/exploration/frontier-system.js',
  './src/exploration/exploration-system.js',
  './src/exploration/recovery-system.js',
  './src/exploration/survey-system.js',
  './src/location/geolocation-service.js',
  './src/location/location-privacy.js',
  './src/persistence/legacy-save-migration.js',
  './src/persistence/offline-simulator.js',
  './src/persistence/road-chunk-cache.js',
  './src/persistence/road-graph-codec.js',
  './src/persistence/save-repository.js',
  './src/persistence/storage-access.js',
  './src/persistence/tab-coordinator.js',
  './src/rendering/camera.js',
  './src/rendering/build-placement-overlay.js',
  './src/rendering/combat-renderer.js',
  './src/rendering/frontier-renderer.js',
  './src/rendering/friendly-order-overlay.js',
  './src/rendering/exploration-renderer.js',
  './src/rendering/combat-effects.js',
  './src/rendering/renderer.js',
  './src/rendering/radar-renderer.js',
  './src/rendering/threat-analysis.js',
  './src/rendering/tactical-overlay.js',
  './src/rendering/road-renderer.js',
  './src/roads/geometry.js',
  './src/roads/graph-merge.js',
  './src/roads/graph-cleanup.js',
  './src/roads/intersection-clustering.js',
  './src/roads/overpass-client.js',
  './src/roads/parallel-road-collapse.js',
  './src/roads/road-constants.js',
  './src/roads/road-filter.js',
  './src/roads/road-graph.js',
  './src/roads/road-parser.js',
  './src/roads/road-service.js',
  './src/roads/road-world-manager.js',
  './src/roads/world-chunk-grid.js',
  './src/styles/app.css',
  './src/ui/base-placement-screen.js',
  './src/ui/base-command-ui.js',
  './src/ui/civilization-ui.js',
  './src/ui/combat-ui.js',
  './src/ui/deployment-ui.js',
  './src/ui/dom.js',
  './src/ui/map-input.js',
  './src/ui/menu-ui.js',
  './src/ui/notifications.js',
  './src/ui/radar-preferences.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(cached => {
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  })));
});
