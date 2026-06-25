# Browser and network check v0.32.6

## Local HTTP assets

- HTTP 200 `/`
- HTTP 200 `/frontline-roads/`
- HTTP 200 `/frontline-roads/src/app/bootstrap.js`
- HTTP 200 `/frontline-roads/src/roads/overpass-client.js`
- HTTP 200 `/frontline-roads/src/roads/sandbox-jsonp-transport.js`
- HTTP 200 `/frontline-roads/src/roads/road-world-manager.js`
- HTTP 200 `/frontline-roads/sw.js`

All required local resources above returned HTTP 200.

## Public Overpass connectivity from this container

Direct requests to all configured public endpoints stopped at DNS resolution (`Could not resolve host`). The container therefore cannot prove a live public-server success. This is an environment limitation, not a successful network test.

## Headless Chromium

Chromium was launched against the local release. It produced no DOM output and was terminated after 25 seconds. The process reported environment-level failures for inotify, DBus and NETLINK socket permissions. No application-originated JavaScript exception was emitted before termination, but this is not a completed browser interaction test.

The transport/parser/merge/save path is covered by deterministic browser-shaped and Overpass-shaped integration tests. GPS, real public Overpass responses, Service Worker activation and touch interaction remain deployment-device checks.
