# Phase 0 — current implementation audit

## Confirmed structural conflicts

1. Road acquisition and graph construction exist in `game-core.js`, `game-map-v36.js`, and `civilization-base-setup.js`.
2. Initial startup creates or loads game state before the later base setup module decides whether a base exists.
3. Runtime behavior depends on script load order and later function replacement.
4. Canvas pointer handlers are registered by more than one file.
5. Offline progress exists in the legacy UI layer and is later replaced by civilization code.
6. Current UI still describes candidate locations, travel within 50 metres and a 30-second stay although the newest base setup uses direct map selection.
7. Several civilization files are minified single-line modules, increasing review and regression risk.
8. Placeholder payload files remain in the application shell despite not containing runtime behavior.

## Refactor decisions

- The public directory remains unchanged until final verification.
- The new implementation is developed as ES modules.
- Road acquisition has one owner: `RoadService`.
- Canvas input has one owner: `MapInput`.
- Lifecycle changes are explicit and validated.
- The game state is not initialized as playable until base placement is confirmed.
- Base selection and gameplay use the same in-memory road graph; confirmation performs no second Overpass request.
- Single-HTML generation is excluded from development and will be performed only before blockchain upload.
