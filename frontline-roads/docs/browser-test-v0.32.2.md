# Browser test result v0.32.2

- Release: `0.32.2-collapse-recovery-balance`
- Local HTTP entry: HTTP 200
- Application entry: HTTP 200
- Stylesheet: HTTP 200
- Bootstrap module: HTTP 200
- New recovery-balance module: HTTP 200
- Service worker: HTTP 200

Headless Chromium was attempted with a clean profile, no sandbox, disabled GPU, and an 8-second virtual-time budget. The browser produced no DOM output before the command timeout. Its diagnostics show container restrictions rather than an application exception:

- inotify limits could not be read
- NETLINK socket creation was denied
- DBus was unavailable

No missing local asset or JavaScript module error was observed. GPS, touch interaction, background/foreground transition and Service Worker replacement remain final-device checks on the GitHub Pages HTTPS deployment.
