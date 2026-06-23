# Browser test result v0.30.0

## HTTP delivery

A local HTTP server successfully returned:

- `/` — 200 HTML
- `/fr/` — 200 HTML
- `/frontline-roads/` — 200 HTML
- versioned `src/styles/app.css?v=0.30.0` — 200 CSS
- versioned `src/app/bootstrap.js?v=0.30.0` — 200 JavaScript
- versioned `src/combat/enemy-personalities.js?v=0.30.0` — 200 JavaScript
- `sw.js` — 200 JavaScript

## Headless Chromium boundary

Chromium was invoked at a 390 × 844 mobile viewport with a local HTTP URL. It stopped before DOM or screenshot generation because the container cannot access the required inotify configuration, DBus socket or NETLINK socket. The process timed out with status 124.

No application JavaScript exception, missing production module or failed application asset request was observed. Interactive GPS permission, touch input, installed-PWA replacement and final mobile layout still require the deployed HTTPS page.
