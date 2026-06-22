# Browser verification limitation — v0.18.0

## Result

A live Chromium smoke test could not be completed in the provided execution environment.

The browser blocked all attempted local application origins before application startup:

- `http://127.0.0.1/...`
- `http://localhost/...`
- `file://...`

The returned browser error was `net::ERR_BLOCKED_BY_ADMINISTRATOR`. No FRONTLINE ROADS runtime exception occurred before the block.

## Completed substitutes

The following checks were completed instead:

- full DOM interaction test for tool selection, candidate creation and confirmation;
- invalid-second-tap regression test;
- unaffordable-confirmation state test;
- minimal Canvas tests for tower and barrier planning overlays;
- exact capture-radius Canvas test;
- CSS structural validation;
- portrait and short-landscape media-rule inspection;
- complete syntax and 115-test regression suite.

## Required publication smoke test

After deployment, verify on at least one portrait and one landscape mobile viewport:

1. Open a build tool.
2. Confirm valid sites and the 85 m radius remain visible.
3. Select a candidate and confirm its effect range is visible.
4. Confirm the context panel remains scrollable and its actions remain reachable.
5. Confirm a map tap does not spend resources.
6. Confirm explicit construction spends resources exactly once.
7. Select an enemy base and confirm the 50 m capture circle.

This document records an environment limitation and is not a claim that the browser smoke test passed.
