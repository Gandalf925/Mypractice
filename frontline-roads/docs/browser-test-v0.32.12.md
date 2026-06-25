# Browser verification v0.32.12

- Static HTML/CSS regression confirms gameplay camera controls are nested in the HUD grid and no longer use map-overlay bottom positioning.
- Local Chromium screenshot execution was attempted with a 390×844 viewport. Chromium stopped before producing a screenshot because the container cannot access required inotify, DBus and NETLINK facilities.
- Android touch, screen rotation, safe-area spacing and installed-PWA cache replacement remain public HTTPS device checks.
