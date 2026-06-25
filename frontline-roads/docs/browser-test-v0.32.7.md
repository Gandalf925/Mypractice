# Browser check v0.32.7

## Attempted checks

- Chromium executable: `/usr/bin/chromium`
- Local static HTTP server attempt on `127.0.0.1:8765`
- Direct `file://` headless DOM load with local-file access enabled

## Result

The execution environment prevented a complete browser run before the application DOM was produced.

- The local HTTP listener could not be reached from the command environment.
- Chromium could not read the container inotify limit, could not bind its NETLINK socket, and could not connect to DBus.
- The direct file load produced no DOM before the process was terminated.

No claim of successful GPS, touch, Service Worker, or live canvas interaction is made from this environment. These remain GitHub Pages / real-device checks.

## Compensating verification

- Every JavaScript source file passed `node --check`.
- The full test suite and single-concurrency test suite passed.
- The service-worker app shell includes every runtime JavaScript and CSS file.
- The dedicated tests exercise moving expedition anchors, build-site validation, spatial healing through the normal defense update path, disabled recovery facilities, field-barracks capacity, legacy migration, save/restore, and opening-balance regression.
