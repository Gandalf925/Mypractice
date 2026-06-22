# v0.12.2 Browser road data transport fix

## Confirmed symptom

v0.12.1 reached `ERROR` on Android Chrome after all direct POST requests failed. The UI discarded the per-endpoint failure details, so the exact browser/network/CORS cause could not be distinguished from the screenshot.

## Defects in v0.12.1

1. Browser acquisition still depended entirely on cross-origin `fetch()`.
2. It set request headers and options beyond the minimal official Overpass browser example.
3. There was no transport fallback independent of CORS.
4. Endpoint and transport failures were hidden from the user.

## v0.12.2 changes

- Browser path uses Overpass's native `jsonp` output first.
- JSONP callback names are generated from letters, digits, and underscores only.
- Failed JSONP falls back to the official minimal POST shape: method and body only.
- Query remains restricted to the nine road classes used by the game.
- `out geom qt` reduces sorting overhead.
- Total road acquisition budget increased to 90 seconds.
- UI shows endpoint, transport, attempt count, and final diagnostics.
- State error records retain diagnostics.

## Verification

`npm run verify`: 61 passed, 0 failed.

The sandbox cannot execute a real Android mobile-network request. Deployment verification remains required.
