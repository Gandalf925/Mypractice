# System-wide regression audit v0.22.2

## Scope

The audit was performed before facility-tier phase 2. The v0.22.1 tactical-order changes were checked against the complete active game loop rather than only against squad-order unit tests.

Reviewed systems:

- two-stage construction, build zones and resource mutation
- defensive combat, enemy waves, hostile-base levels and enemy scaling
- friendly deployment, combat, stop, retreat, resume and withdraw states
- dynamic road chunks, graph merging, frontier generation and exploration sites
- field-recovery items and civilization-development requirements
- multiple player bases and remote map switching
- active, peripheral, dormant and offline simulation
- compact save encoding, legacy normalization and restore
- rendering/input ownership, service-worker app shell and release metadata

## Findings

No cross-system state corruption or broken gameplay path was found. Construction, civilization, road acquisition, frontiers, field recovery and base management were not directly changed by v0.22.1 and remained compatible under combined simulation.

Three issues were found inside the new squad-order feature and corrected.

### 1. Route-planning cost on expanded maps

Route scoring previously scanned every known enemy and every defense for each candidate road edge. On a large discovered road graph this could block the UI while opening the route planner.

The planner now:

- reuses the combat spatial index for known enemies
- builds a compact point index for player bases and defenses
- caches pressure and support scores per edge during one planning operation
- limits segment queries to the edge's local bounding area

Build-environment reference benchmark:

| Road graph | Before | After |
|---:|---:|---:|
| 400 nodes | about 0.04 s | about 0.02 s |
| 1,600 nodes | about 0.14 s | about 0.04 s |
| 3,600 nodes | about 0.33 s | about 0.05 s |
| 6,400 nodes | about 0.60 s | about 0.07 s |

These are relative build-container measurements, not device guarantees.

### 2. Mid-edge distance and ETA

When a squad was between intersections, route-card distance and ETA began at the next graph node and omitted the remaining part of the current road segment. The displayed route is now connected from the squad's exact position, and the remaining segment distance is included in route metrics.

### 3. Route-line tap handling

A tap on a visible candidate route was previously interpreted as a request to add a waypoint. Route hit-testing now runs before road-node selection, so tapping a route line selects that route. Tapping an eligible intersection still adds a waypoint.

## Combined stress verification

A mixed scenario was run with multiple player bases, multiple hostile bases, several friendly squads, enemy sorties, stop/retreat/withdraw commands, save/restore and remote simulation. Checked invariants included:

- valid squad route edges and bounded edge progress
- no dangling enemy engagement IDs
- no negative resources
- stable serialization and restore
- no teleport during mid-edge orders
- continued enemy vulnerability during retreat and withdrawal

No state corruption was detected.

## Deferred by design

Facility tiers and all later agreed phases remain unimplemented. This release changes no facility unlocks, forward-base rules, surveying behavior, additional squad classes, recovery facilities or recovery squads.
