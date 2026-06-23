# Browser test limitation v0.25.0

A local HTTP server returned the complete application shell with HTTP 200 (8,692 bytes).

The available Chromium process timed out before producing DOM output. Its diagnostics reported restricted inotify access, missing DBus sockets and denied netlink binding inside the build container. No application JavaScript exception, missing module or HTTP failure was reported.

Final deployed-HTTPS checks remain required for GPS movement, live Overpass requests, mobile portrait/landscape layout and service-worker update behavior.
