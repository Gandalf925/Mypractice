# FRONTLINE ROADS v0.33.2 — Tactical Build Sites, Walls and Gates

## Goals

This release reduces construction clutter and recurring combat cost without removing the player's existing facilities or changing civilization progression, resources, enemy density, offline rules, or the level-7 unlimited-territory policy. The one intentional tactical rule change is the separation between walls and gates requested during the audit.

## Tactical construction sites

The road graph remains lossless. Construction now uses a separate cached tactical-site projection:

- nodes with three or more connections are intersections;
- degree-one nodes are road terminals;
- degree-two nodes with a turn of at least 50 degrees are major curves;
- long roads receive sparse interval sites, with at most roughly 55 metres between representative opportunities;
- each construction anchor always receives a nearest-road fallback when no tactical site is available;
- repair, medical, survey and field-barracks facilities use representative support sites, limited to six per anchor (one for a field barracks).

OpenStreetMap shape nodes are therefore retained for road geometry and movement but no longer all become facility buttons.

## Wall sections and physical occupancy

Consecutive degree-two road edges are combined into bounded wall sections of at most approximately 150 metres. A section exposes one wall/gate position rather than one position per source edge.

- The displayed point is stored as `placementPoint` and restored through save/load.
- A section stores its source edge set for occupancy checks.
- A wall is rejected when the section is occupied, when another wall is within 45 metres, or when a physically overlapping road edge lies within the duplicate-geometry tolerance.
- Separate carriageways remain independent when their physical spacing or connectivity differs.
- A section that intersects a construction radius remains usable even when its midpoint is outside the radius; the emitted point is projected inside the relevant anchor radius.
- Existing saved walls are not removed or relocated. The stricter rule applies only to new construction.

## Wall and gate roles

Walls and gates no longer differ only by name and hit points.

- A wall blocks enemies and friendly squads. Friendly route planning treats its road edge as unavailable and selects another connected route.
- A gate continues to stop enemies, but friendly squads may route through it.
- Gate hit points are lower than the same-tier wall, while gate conversion and upgrade costs remain higher.
- Building, removing, destroying, repairing, or converting a route-blocking facility marks affected routes for recalculation without teleporting units already travelling on an edge.

## Removed recurring work

- Non-blocking towers and support facilities no longer invalidate every enemy route after construction.
- The unused route-preview calculation previously performed after construction is absent.
- Tactical road sites and wall sections are cached by road-graph identity.
- Construction placement signatures no longer change for every resource-unit change; geometry is regenerated only when affordability crosses a boundary or the road, anchors, occupancy, or selected tool changes.
- Enemy, friendly-squad and defense runtime definitions are cached as immutable values.
- Friendly tactical route options build the active-wall edge set once instead of rescanning all defenses for each route strategy.
- Range-only hot paths in defense, enemy and friendly combat use squared-distance comparisons and squared-distance ordering, avoiding unnecessary square roots.

## Fixed benchmark

The benchmark road is a 300-metre straight chain with 31 source nodes and 30 source edges, all inside a level-7 major-base construction radius.

| Metric | v0.33.1 | v0.33.2 | Reduction |
|---|---:|---:|---:|
| Tower construction sites | 31 | 6 | 80.6% |
| Wall construction sites | 30 | 2 | 93.3% |

The production civilization playtest's `standard-civ7` scenario uses ten enemy bases, 62 initial defenses, 22 friendly squads and a 300-second simulation. In the same container:

| Build | Simulation time |
|---|---:|
| v0.33.1 | 4037.5 ms |
| v0.33.2 | 2601.2 ms |

This is a deterministic CPU benchmark from one controlled run, not a claim about Android frame rate. It represents a 35.6% reduction in this environment while preserving the scenario outcome and balance checks.

## Compatibility

- Save key remains `frontline_roads_refactor_v2`.
- Save schema remains version 2.
- Existing facilities remain in place.
- Existing overlapping walls remain in the save; only further overlapping construction is rejected.
- Civilization level 7 still permits unlimited major and field bases.
- Enemy caps, wave balance, resource economics and offline progression remain unchanged from v0.33.1.

## Verification targets

- Concurrent and serial regression suites.
- Tactical-site reduction and long-road fallback.
- Wall-section consolidation and in-range projection.
- Duplicate physical road rejection.
- Wall-versus-gate friendly routing.
- Existing save normalization and facility preservation.
- Civilization level 0–7 balance harnesses.
- Syntax, import reachability, cycles, service-worker coverage, duplicate HTML IDs, local HTTP delivery, file hashes, ZIP integrity and ZIP re-extraction.
