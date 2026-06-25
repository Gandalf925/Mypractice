# Browser and local asset check v0.32.5

## Local HTTP assets

A local HTTP server was started from the GitHub Pages release root. The following resources returned HTTP 200:

- `/`
- `/frontline-roads/`
- `/frontline-roads/src/app/bootstrap.js`
- `/frontline-roads/src/combat/defense-lifecycle.js`
- `/frontline-roads/src/styles/app.css`
- `/frontline-roads/sw.js`

## Headless Chromium

Chromium was available, but the page could not reach DOM output in this container. The process stalled after environment-level failures involving inotify, DBus, and NETLINK socket permissions. No application-originated JavaScript exception was reported before termination, but this is not a completed browser interaction test.

GPS, touch input, Service Worker activation, and a real old-save reload remain deployment-device checks.
