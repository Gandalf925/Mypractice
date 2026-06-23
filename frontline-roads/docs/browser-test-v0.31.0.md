# Browser test result v0.31.0

- Release: `0.31.0-gameplay-stabilization`
- Local HTTP outer entry: 200
- Legacy `/fr/` entry: 200
- Application entry: 200
- Stylesheet: 200
- Bootstrap module: 200
- Coordinated-deployment module: 200
- Service worker: 200
- Headless browser executable: `chromium`
- Headless browser result: no DOM output before timeout

Local HTTP delivery succeeded for all tested deployment and runtime resources. Headless Chromium was unable to reach DOM output in this container because file watching could not read the inotify limit, DBus was unavailable and the NETLINK socket was denied. The process was terminated after the controlled timeout. No missing local resource was reported by the HTTP checks or automated asset tests.

Mobile GPS acquisition, real walking, touch accuracy, external road-data latency and installed-PWA update behavior still require validation on the deployed HTTPS build.
