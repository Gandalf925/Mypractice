# Browser test result v0.31.3

- Release: `0.31.3-command-capacity-resource-hud`
- Local HTTP outer entry: 200
- Application entry: 200
- Stylesheet: 200
- Bootstrap module: 200
- Friendly-force module: 200
- Civilization UI module: 200
- Service worker: 200
- Headless browser executable: `/usr/bin/chromium`
- Browser navigation result: blocked by the execution environment with `ERR_BLOCKED_BY_ADMINISTRATOR`

All package and runtime resources required by this release were served successfully over local HTTP. Chromium launch succeeded, but navigation to both localhost and a local file URL was denied by the container administrator before application JavaScript ran. No missing resource or application JavaScript exception was observed.

The responsive HUD structure is covered by automated source and behavior tests: the resource dock uses a fixed two-row scroll layout, portrait top actions and resources have separate vertical positions, and low-height landscape uses a one-row resource dock. Real-device GPS, touch, browser safe-area behavior and installed-PWA update behavior remain deployment checks.
