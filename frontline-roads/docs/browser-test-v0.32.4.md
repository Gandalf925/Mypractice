# Browser and external-network test result v0.32.4

- Release: `0.32.4-survey-range-reliability`
- JavaScript syntax validation: passed
- Asset-loader and application-shell tests: passed
- Overpass POST/GET switching, endpoint rotation and preference persistence: passed with injected network fixtures
- Survey communication-success versus road-processing-failure classification: passed with deterministic fixtures
- Civilization-scaled major/simple-base construction ranges: passed for levels 0 through 4

## Local browser attempt

A local HTTP listener could not accept connections in this execution environment. Headless Chromium was also attempted with a local file URL, a clean profile, no sandbox, disabled GPU and a 30-second limit. It produced no DOM before timeout. Chromium reported blocked inotify access, denied NETLINK socket creation and missing DBus.

The attempt did not report an application JavaScript exception, but it did not complete page initialization.

## Public Overpass attempt

A direct request to `overpass-api.de` was attempted from the execution container. Outbound DNS resolution is disabled in this environment, so the request stopped before reaching the service (`Could not resolve host`). Therefore this environment cannot honestly prove a live public endpoint response.

The deployed game now exposes field evidence inside each survey facility:

- `COMM 成功`: the browser received a valid Overpass JSON response.
- `LINK`: the endpoint host and GET/POST transport used.
- `RESPONSE`: raw response element count.
- `ROADS`: roads successfully parsed and integrated.
- `通信成功・道路処理失敗`: the remote response worked but local road processing failed afterward.
- `通信失敗`: no valid remote response was received.

Live Overpass availability, GPS, touch interaction, Service Worker update and background/foreground behavior remain final-device checks on the GitHub Pages HTTPS deployment.
