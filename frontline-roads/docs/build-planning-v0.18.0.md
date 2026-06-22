# FRONTLINE ROADS v0.18.0 — Build planning UX

## Objective

Resolve three construction problems without changing combat balance or save compatibility:

1. Players could not identify valid construction locations before tapping.
2. Facility effective range and enemy-base capture range were not visible.
3. Facility role and effect were not explained before or after construction.

## Phase 1 — Construction domain separation

The old immediate-build path was replaced by three explicit operations:

- `listBuildSites(state, type)`: returns structurally valid, unoccupied sites inside the 85 m build radius.
- `previewAt(state, type, point, tolerance)`: resolves a candidate without changing resources or game state.
- `buildCandidate(state, candidate)`: revalidates the candidate, consumes resources once and creates the defense.

Candidate validation checks the facility kind, road graph, exact road/intersection identity, build radius, occupancy and current resources. Barrier construction still triggers enemy rerouting. Rebuilding a ruined site at the same world time creates a distinct defense ID.

Audit correction: nearby candidates are evaluated in distance order. An occupied nearest road or intersection no longer blocks another valid site within the same tap tolerance.

## Phase 2 — Construction map layer

A dedicated `build-placement-overlay` renders:

- the exact 85 m build radius around the home base;
- valid tower intersections;
- only the in-range portion of valid barrier roads;
- the selected candidate crosshair;
- the candidate facility's real effective range;
- amber state when current resources are insufficient.

The construction overlay is drawn after transient combat effects so explosions and shots do not hide the candidate.

## Phase 3 — Two-stage construction UI

Selecting a build tool now opens a compact planning panel. A map tap only creates a candidate. Resource consumption and defense creation occur only after explicit confirmation.

The panel presents:

- facility role;
- operational summary;
- actual effect;
- placement guidance;
- real runtime metrics;
- cost, stock status and number of currently available sites.

Audit corrections:

- an invalid second tap clears the previous candidate to prevent accidental confirmation at the wrong location;
- confirmation is disabled while resources are insufficient;
- the obsolete immediate-build method was removed rather than retained as compatibility code;
- site scans use a state signature and are not recomputed on every render frame.

## Phase 4 — Existing-defense and capture awareness

Selecting an existing defense displays its runtime tier values, HP, status, role, effect and placement guidance. Selected enemy bases display the exact shared 50 m capture radius and the current distance, entry status and capture progress.

The capture radius is now a single shared constant used by both gameplay validation and rendering, preventing UI/rule divergence.

## Compatibility

- Save key: unchanged (`frontline_roads_refactor_v2`)
- Schema version: unchanged (`2`)
- Road acquisition: unchanged
- Enemy movement and damage rules: unchanged
- Defense costs and combat values: unchanged
- Base-selection viewport from v0.17.1: retained
- Performance profiles from v0.17.0: retained

## Verification

- JavaScript syntax checks: passed
- Automated tests: 115 passed, 0 failed
- CSS structure: balanced
- Local source imports: 69 modules, no missing paths or cycles
- HTML IDs: 47 unique IDs
- Service worker app shell: contains every runtime JS/CSS file
- Twelve-hour simulation and deterministic offline simulation: passed
- Save migration and graph-index reconstruction: passed

See `browser-test-limit-v0.18.0.md` for the execution-environment limitation affecting live browser verification.
