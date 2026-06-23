# Browser verification limitation — v0.21.0

Headless Chromium was started after the completed development phases against local and file URLs.

In this execution container Chromium did not reach DOM loading before the enforced timeout. Its diagnostics report unavailable DBus, denied netlink binding and unavailable inotify limits. The local execution environment also rejected one HTTP-listener attempt before application loading.

These failures occurred before application JavaScript execution and are not evidence of an application exception or missing asset. DOM contracts, Canvas calls, UI actions, module references and PWA resources are covered by automated tests.

Required deployment checks:

- HTTPS geolocation and location freshness updates;
- real Overpass road acquisition while walking;
- assault-squad deployment and return animation;
- enemy-base destruction and item appearance;
- physical item collection within 40 m;
- second-base establishment at a remote road;
- BASES panel map switching in portrait and landscape;
- service-worker upgrade from v0.20.0.
