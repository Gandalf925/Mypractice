# Browser verification limitation — v0.22.1

A local HTTP server successfully served the complete application at `127.0.0.1:8765` and returned the game `index.html` with HTTP 200.

Chromium was launched in headless mode with sandbox, GPU and shared-memory restrictions disabled. It did not produce DOM output before the 25-second execution timeout. The container reported unavailable DBus, denied netlink access and an unreadable inotify limit under `/proc` before application DOM capture.

No application JavaScript exception, missing module, HTTP failure or service-worker path error was reported. The limitation occurred in the browser process before DOM verification.

Alternative verification completed in this environment:

- syntax validation for all source and test JavaScript;
- complete Node regression suite;
- command-state and graph-route validation tests;
- stale-route transaction tests;
- save/restore and old-save normalization tests;
- remote-region combat regression tests;
- DOM source-contract tests;
- Canvas route-overlay tests;
- service-worker application-shell validation;
- static import, HTML-ID and CSS audits.

Required deployed-device checks:

- select a moving friendly squad and stop it at the visible current position;
- choose a retreat destination, compare route lines and add/remove two waypoints;
- confirm that a mid-edge order waits for the next intersection without a position jump;
- stop during retreat and resume toward the held retreat destination;
- complete a retreat, then resume toward the original hostile base using a newly selected route;
- withdraw through a selected route and confirm that the old attack mission cannot be resumed;
- confirm that enemies still damage retreating or withdrawing squads;
- verify portrait and landscape command panels do not obscure the selected route.
