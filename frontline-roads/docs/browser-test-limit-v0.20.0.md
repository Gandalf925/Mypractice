# Browser verification limitation — v0.20.0

A local HTTP server was started and headless Chromium was invoked against the development fixture after the implementation phases.

Chromium timed out before producing DOM output. Diagnostics consistently reported execution-container restrictions:

- netlink socket permission denied;
- unavailable system DBus socket;
- inaccessible inotify watcher limits.

The failure occurs before application DOM inspection and does not expose an application JavaScript exception, failed module request or HTTP server error.

Fallback verification completed:

- all source and test JavaScript syntax checks;
- HTML resource and required-control checks;
- service-worker app-shell path checks;
- minimal Canvas rendering for roads, radar, frontiers, exploration and construction;
- movement-driven chunk queue, cache, merge and retry tests;
- fixed frontier-source and source-clearing tests;
- active, peripheral and dormant simulation tests;
- compact-save encoding, privacy and reconstruction tests;
- deterministic offline simulation and twelve-hour bounded simulation.

A real-device publication check should confirm GPS-driven Overpass acquisition, visible map expansion, frontier markers, source interaction and construction on newly loaded roads.
