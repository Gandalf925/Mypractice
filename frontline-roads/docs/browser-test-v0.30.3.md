# Browser test result v0.30.3

- Release: `0.30.3-compact-defense-panel`
- Local HTTP outer entry: 200
- Local HTTP application entry: 200
- Stylesheet: 200
- Compact facility UI module: 200
- Service worker: 200
- Legacy `/fr/` entry: 200
- Headless Chromium DOM generation: not completed

Chromium stopped before DOM output because the execution environment denied inotify and NETLINK access and did not provide DBus. The local server continued to return the complete HTML, CSS and JavaScript resources without 404 responses.

The deterministic DOM tests verified the compact summary, mutually exclusive description and upgrade states, persistent mode during live HUD rerenders, visible action row, explicit upgrade confirmation and second-tap dismissal. Final touch interaction and viewport appearance still require the deployed HTTPS build on a physical mobile device.
