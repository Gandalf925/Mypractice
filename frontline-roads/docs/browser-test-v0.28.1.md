# Browser test result v0.28.1

A local HTTP smoke-test endpoint was started successfully and returned the release HTML with HTTP 200.

Two Chromium headless launch attempts were then made at a 390 × 844 mobile viewport with the built-in development fixture enabled. Chromium stopped before producing DOM output or a screenshot because the build container denies or omits required host facilities:

- Linux netlink socket binding was denied.
- the system DBus socket was unavailable;
- the inotify configuration could not be read;
- the headless process did not terminate after its virtual-time budget and was stopped by the external timeout.

No application JavaScript exception, missing module, failed HTTP asset request or syntax error was reported before the browser process stalled. Automated verification covers the direct target-to-deployment contract, removal of the global deployment control, fixed hostile/recovery targets, compact layout CSS, all existing gameplay systems, persistence and the PWA app shell.

Final touch-layout, GPS and live Overpass behavior still require confirmation on the deployed HTTPS page or an unrestricted local browser.
