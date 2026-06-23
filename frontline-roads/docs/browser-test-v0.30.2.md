# Browser test result v0.30.2

- Release: `0.30.2-road-expansion-reliability`
- Local HTTP outer entry: 200
- Local HTTP application entry: 200
- Stylesheet: 200
- Bootstrap module: 200
- Road-world manager module: 200
- Service worker: 200
- Legacy `/fr/` entry: 200
- Headless Chromium DOM generation: not completed

Chromium stopped before DOM output because the execution environment denied inotify and NETLINK access and did not provide DBus. No application JavaScript exception, missing module, stylesheet 404 or local HTTP failure was detected before the environment-level stop.

Final GPS, live Overpass, background/resume and touch interaction validation must be performed on the deployed HTTPS build on a physical mobile device.
