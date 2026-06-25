# FRONTLINE ROADS v0.33.1 — Tab Resume Recovery

## Symptom

After Android Chrome suspended or discarded the game tab, returning to it could leave the page on the styled initial-base screen with the lifecycle label still at `BOOT`. The save itself was not necessarily lost; the application bootstrap module had not completed loading.

## Confirmed cause

The v0.33.0 service worker handled every same-origin request with an unbounded network-first strategy. When Android suspended a pending module request, the request could remain unresolved instead of failing. The stylesheet was already available, so the page looked complete, but `bootstrap.js` and its dependency graph never executed. Since the bootstrap code had not loaded, the game could not restore the saved session or display an error.

The page lifecycle also had two independent `pagehide` paths. One saved the game while the other destroyed the runtime when `event.persisted` was false. That teardown was unnecessary for a document that may be frozen or restored by the browser.

## Changes

### Service worker

- Application JavaScript, CSS, icons and manifest now use cache-first delivery with background refresh.
- Version query strings are ignored when matching the installed application shell.
- Navigation remains network-first but has a 4.5-second timeout and falls back to the installed `index.html`.
- Uncached asset requests also have a 4.5-second timeout.
- The cache namespace is versioned as `frontline-roads-v0-33-1-tab-resume-recovery`.

### Asset bootstrap

- Stylesheet loading has a 5-second per-attempt timeout.
- Dynamic bootstrap imports have a 7-second per-attempt timeout.
- A 12-second `BOOT` watchdog displays a recovery panel instead of leaving an inert initial screen indefinitely.
- The recovery action reloads the saved game and does not clear local storage, caches or the save key.

### Page lifecycle

- `visibilitychange`, `freeze`, `pagehide`, BFCache `pageshow` and discarded-document restoration use one pause/save/resume path.
- `pagehide` no longer destroys the application runtime.
- Returning to a visible tab refreshes the primary-tab lease immediately rather than waiting for a throttled heartbeat.
- An established game explicitly hides the initial-placement overlay and restores the playing HUD on resume.
- BFCache and discarded-tab restoration wait for normal startup before applying the resume path.

### Compatibility

- Save key remains `frontline_roads_refactor_v2`.
- Save schema remains version 2.
- Civilization, combat, roads, resources, facilities and balance values are unchanged from v0.33.0.

## Verification

- Concurrent regression: 445 passed, 0 failed.
- Serial regression: 445 passed, 0 failed.
- Service-worker suspension simulation: cached JavaScript returned while the network promise never settled.
- Navigation failure simulation: cached application HTML returned.
- Civilization Lv.5–7 playtest: 9 scenarios passed.
- Production JavaScript modules: 102.
- Modules reachable from bootstrap: 102.
- Unconnected modules: 0.
- Unresolved imports: 0.
- Circular dependencies: 0.
- Duplicate HTML IDs: 0.
- Service-worker runtime asset omissions: 0.
- Local HTTP checks: root, legacy alias, application HTML, bootstrap, CSS, service worker and manifest all returned HTTP 200.

## Environment limitation

The supplied container cannot complete headless Chromium startup because inotify, DBus and NETLINK facilities are restricted. Android tab suspension, BFCache, GPS and GPU behavior therefore require final confirmation on the published HTTPS build.
