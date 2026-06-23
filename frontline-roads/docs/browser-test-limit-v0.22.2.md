# Browser test limitation v0.22.2

The browser-launch check could not reach DOM evaluation in the build container. Chromium reported environment-level DBus, netlink and inotify restrictions and timed out with an empty DOM result. The same container also did not provide a reliable loopback response during the final retry, so this attempt cannot be used as an application-level HTTP or rendering result.

No application JavaScript exception or missing-module report was obtained from Chromium. Browser-dependent GPS, Overpass communication, touch-route selection and portrait/landscape layout therefore still require final verification on the deployed HTTPS page or an unrestricted local browser.

Automated alternatives completed in this release include:

- DOM and UI source-contract tests
- Canvas route-overlay and route-hit tests
- serial and parallel full-suite execution
- long and offline simulation tests
- mixed-system stress simulation
- static module reachability, import, cycle, HTML-ID and CSS checks
