# Browser test limitation v0.23.0

A local HTTP server successfully returned the v0.23.0 application shell with HTTP 200.

Chromium was then launched in headless mode against the local development fixture. The browser did not reach DOM output before the command timeout because the execution container denied or lacked required Linux facilities:

- netlink socket binding (`Permission denied`);
- DBus system/session endpoints;
- inotify limit access.

No application JavaScript exception, missing module, HTTP failure or service-worker resource failure was reported. DOM and UI behavior were instead verified with the existing fake-DOM contract tests, tier-specific UI tests, source/resource validation and the full Node test suite.

The deployed HTTPS build still requires a final physical-browser check for touch scrolling and portrait/landscape panel comfort.
