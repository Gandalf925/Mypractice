# Browser test limitation v0.27.0

A local browser smoke test was attempted after the recovery phase.

- The container did not permit the local Python HTTP listener to accept connections during this run.
- Headless Chromium stopped before DOM creation because it could not access Linux netlink, DBus and inotify configuration in the sandbox.
- Chromium produced no application JavaScript exception and no rendered DOM.

Automated verification instead covers DOM contracts, construction UI, deployment UI, Canvas rendering, PWA paths, recovery state transitions, save/restore, tactical orders, regional simulation and full regression. The deployed HTTPS build still requires final mobile checks for touch layout, GPS and live Overpass access.
