# Browser test result v0.29.1

- Local HTTP outer entry: 200
- Local HTTP `/fr/` compatibility entry: 200
- Local HTTP application entry: 200
- Versioned stylesheet: 200, `text/css`
- Versioned bootstrap module: 200, `text/javascript`
- Enemy personality module: 200, `text/javascript`
- Service Worker: 200, `text/javascript`
- Asset-loader simulation: current path success and `/fr/` fallback success
- Chromium headless result: blocked before screenshot by the container's inotify, DBus and netlink restrictions (`rc=124`)

The deployed mobile browser must still confirm final visual rendering, GPS permission and installed-PWA replacement. No application-side missing import, syntax error, missing local file or loader-path failure was detected by automated verification.
