# Browser test limitation v0.24.0

A local HTTP server successfully returned the v0.24.0 application shell with HTTP 200 and the complete `index.html` payload.

Chromium was then launched in headless mode against the local application. It did not reach DOM output before the 20-second timeout because the execution container denied or lacked required Linux facilities:

- netlink socket binding (`Permission denied`);
- DBus system/session endpoints;
- inotify limit access.

No application JavaScript exception, missing module, HTTP failure or service-worker resource failure was reported. Browser-facing behavior was instead checked through fake-DOM UI contracts, Canvas renderer tests, source/resource validation and the complete Node test suite.

The deployed HTTPS build still requires a physical-device check for:

- fresh GPS placement and rebuild;
- portrait and landscape scrolling in the base command panel;
- map focusing on `FIELD` and `RUIN` markers;
- assault deployment from a simple base;
- enemy attack and destruction feedback.
