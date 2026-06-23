# Browser verification limitation — v0.22.0

A local HTTP server successfully served the complete application at `127.0.0.1`.

Chromium was then launched in headless mode with sandbox, GPU and shared-memory restrictions disabled. The process did not reach DOM output before the execution timeout. The container reported unavailable DBus, denied netlink access and an unreadable inotify limit under `/proc`.

No application JavaScript exception, missing module, HTTP failure or service-worker path error was reported. The failure occurred before the application DOM could be captured.

Alternative verification completed in this environment:

- syntax validation for all source and test JavaScript;
- complete Node test suite;
- DOM contract tests;
- Canvas rendering tests;
- service-worker application-shell validation;
- deterministic defense and enemy-level simulations;
- save and restore of scaled enemy levels;
- long-run and offline simulation regression tests.

Required deployed-device checks:

- enemy detail panel shows the correct enemy level and scaled values;
- tier-zero area shots visibly affect no more than three enemies;
- direct and splash damage are visually distinguishable through HP changes;
- tier-zero slowing no longer keeps a wave almost permanently slowed;
- level-two hostile bases can damage an inadequately layered level-zero defense;
- portrait and landscape context panels remain readable.
