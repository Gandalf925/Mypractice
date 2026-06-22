# FRONTLINE ROADS v0.17.1 — Base-selection viewport

## Problem

During first-base selection, the full-screen map remained visible behind the explanation and confirmation UI. The map was visually noisy and made the initial operation harder to understand.

## Correction

- Rebuilt the initial panel as three explicit regions: explanation, map viewport, confirmation.
- Added `#baseMapViewport` as the only visible and interactive map area during `BASE_SELECTION`.
- Synchronized the full-screen Canvas `clip-path` with the viewport rectangle through `BasePlacementScreen`.
- Made the explanation and confirmation regions effectively opaque.
- Disabled map interaction while location loading or an error is displayed.
- Added dedicated portrait and short-landscape layouts.
- Added viewport frame, label, reticle and accessible labels for the map controls.

## Interaction behavior

- Taps inside the map viewport reach `#mapCanvas`.
- Taps outside the viewport do not reach the Canvas.
- Zoom and recenter controls remain interactive inside the map viewport.
- No game-state, road-acquisition, save, combat or civilization behavior was changed.

## Verification

- JavaScript syntax check: passed.
- Automated tests: 90 passed, 0 failed.
- Portrait 390×844: no overlap between header, map viewport and footer.
- Landscape 844×390: no overlap between the three columns.
- Canvas clip rectangle matched the displayed map viewport in both orientations.
