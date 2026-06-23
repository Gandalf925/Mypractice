# Browser verification limitation — v0.21.1

A local HTTP server successfully served the application at `http://127.0.0.1:8765/frontline-roads/`.

Headless Chromium was then attempted with a 390 × 844 viewport. Chromium did not reach DOM capture within 30 seconds because the container denied or lacked required netlink, DBus and inotify facilities. No application JavaScript exception or missing HTTP resource was reported before termination.

The release is therefore verified through syntax checks, 174 automated tests, DOM-contract tests, Canvas-context tests, PWA app-shell tests and static layout assertions. Final visual confirmation should be performed on the deployed HTTPS page on a phone and desktop browser.
