# FRONTLINE ROADS v0.17.0 Performance Audit

Audit date: 2026-06-23
Version: `0.17.0-performance`

## Result

The runtime was restructured around separate simulation, civilization, UI and rendering cadences. The modular source remains intact and no single-HTML build was generated.

- Automated tests: **88 passed, 0 failed**
- JavaScript and service-worker syntax: passed
- Circular ES-module dependencies: none
- Twelve-hour deterministic offline simulation: passed
- Chromium mobile stress test: passed
- Browser runtime exceptions: 0
- Browser console errors: 0

## Main bottlenecks found

1. Combat, civilization, UI and full-map rendering all ran from every animation frame.
2. Every frame redrew the radar background, every road and the screen overlay.
3. Radar gradients, shadows, glow passes and blend modes were recreated continuously.
4. Tower target searches and shield/commander checks repeatedly scanned the full enemy list.
5. Pathfinding used repeated full-array sorting.
6. Threat ranking was recalculated separately by the map and HUD.
7. Autosave ran every five seconds in the animation path.
8. High device-pixel ratios multiplied canvas raster work on phones.

## Changes made

- Static radar, road and screen-overlay canvases are cached and rebuilt only when the graph, camera, selection, viewport or quality changes.
- Rendering, combat simulation, civilization and UI updates now use independent fixed rates.
- Balanced profile: 24 render Hz, 20 combat Hz, 4 civilization Hz and 2 UI Hz.
- Mobile/touch default: power-saving profile with 18 render Hz, 12 combat Hz, 2 civilization Hz and DPR capped at 0.75.
- High-detail mode remains selectable from the existing menu.
- Canvas DPR is capped by profile instead of following the full phone DPR.
- Enemy spatial hashing is shared by tower and enemy systems each combat tick.
- Route search now uses a binary min-heap and precomputed congestion/defense maps.
- Threat analysis is shared and cached for map and HUD use.
- Off-screen roads, units and effects are culled.
- Balanced/mobile modes avoid expensive canvas shadows, blend modes, excessive route lines and effect counts.
- Health bars are shown selectively according to quality.
- Autosave interval increased to 15 seconds and save work is scheduled during idle time.
- The render scheduler was corrected so floating-point boundaries do not accidentally reduce or duplicate frames.

## Measured synthetic improvement

Stress scene: 840 road edges, 220 enemies and 35 defenses.

| Metric | v0.16.2 | v0.17.0 | Change |
|---|---:|---:|---:|
| 60 render calls | 69.40 ms | 25.14 ms | 63.8% lower |
| Canvas operations per frame | 26,892 | 3,833 | 85.7% lower |
| 120 combat/civilization updates | 105.52 ms | 55.57 ms | 47.3% lower per update |
| Estimated balanced logic work per real second | 52.74 ms | 9.26 ms | 82.4% lower |

These are deterministic synthetic measurements in the same container and are suitable for relative comparison, not as a prediction of every Android device.

## Chromium mobile stress result

Android-like viewport: 390×844, DPR 2, 180 enemies and 30 defenses for five seconds.

- Automatically selected quality: `minimal`
- Combat updates completed: 60/60 expected at 12 Hz
- Slow frames recorded: 0
- Long tasks over 50 ms during the measurement window: 0
- Page errors: 0
- Console errors: 0
- Used JavaScript heap at end: 3,594,661 bytes

Balanced mode was also tested under the same stress scene:

- Combat updates: 100 at approximately 20 Hz
- Render calls: 121 at 24 Hz
- Average measured render JavaScript time: 0.993 ms
- Slow frames: 0
- Page errors: 0

## Remaining device verification

The actual Android device should still be checked after GitHub Pages deployment because GPU drivers, thermal throttling and browser compositor behavior vary. On touch devices this release starts in power-saving quality by default. The user can switch to Standard or High Detail in the menu.
