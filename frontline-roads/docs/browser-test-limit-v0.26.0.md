# Browser test limitation v0.26.0

The application was served through a local HTTP server and returned HTTP 200 with the expected HTML payload. Chromium did not reach DOM creation in the build container. The process stopped before application execution because the environment denied or lacked netlink, DBus and inotify facilities.

This is not evidence of an application JavaScript exception. Syntax, module loading contracts, DOM contracts, Canvas renderer contracts, PWA app-shell coverage and gameplay state transitions are covered by automated tests.

The deployed HTTPS build still requires device checks for touch layout, GPS, live Overpass requests, portrait/landscape presentation and practical multi-squad route selection.
