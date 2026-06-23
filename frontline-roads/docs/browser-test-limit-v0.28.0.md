# Browser test limitation v0.28.0

A browser smoke test was attempted after the retrieval-corps phase.

- Starting a local Python HTTP listener was blocked by the build-container networking restrictions; a loopback `curl` request could not connect.
- Headless Chromium stopped before DOM creation.
- Chromium reported restricted Linux netlink access, unavailable DBus sockets and inaccessible inotify configuration.
- No application JavaScript exception, missing-module error or rendered screenshot was produced.

Automated verification covers HTML/DOM contracts, deployment UI mode switching, Canvas source contracts, PWA paths, reservation and collection state, normal enemy combat, death drops, tactical orders, active/peripheral/dormant simulation, save/restore and full regression. The deployed HTTPS build still requires final touch-layout, GPS and live Overpass checks on a real browser.
