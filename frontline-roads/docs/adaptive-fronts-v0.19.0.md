# FRONTLINE ROADS v0.19.0 — Adaptive fronts

## Objective

Add tactical variation to enemy movement and allow the player to establish defenses around their real position without replacing the stable v0.18.0 construction workflow.

## Phase 1 — Barrier decision profiles

The routing system now measures route cost in estimated seconds:

- normal road cost is edge length divided by enemy speed;
- barrier cost is estimated barrier HP divided by that enemy's barrier DPS;
- each enemy type applies an avoidance, balanced or breach factor;
- tower threat and congestion modifiers remain compatible with the weighted route search.

This produces contextual behavior. Scouts still take very large detours to avoid walls. Engineers and siege units accept a wall when breaking it is faster. Ordinary infantry can breach a weak wall but avoids a healthy wall when a reasonable alternative exists.

Each spawned enemy receives a deterministic route bias between 0.86 and 1.14. It is fixed for that enemy and therefore reproducible in saves and offline simulation.

## Phase 2 — Facility objectives

Facility-targeting enemies use explicit priority lists rather than a single generic `attackTowers` flag.

- Raider: relay → mortar → gun → slow
- Rope cutter: slow → relay
- Siege captain: mortar → gun

A single Dijkstra search evaluates all eligible targets. Priority contributes a limited penalty, so the preferred facility type matters without forcing an absurd cross-map detour. The selected defense ID is stored on the enemy.

When a target is destroyed:

- all enemies assigned to that defense clear the target;
- they finish their current edge before rerouting;
- the next objective is another valid preferred facility or the city;
- specialist behavior and current objective are visible in the enemy context panel.

Building any new defense requests path reevaluation after the current edge. This allows newly placed support facilities to attract specialist enemies without moving an enemy backward or teleporting it.

## Phase 3 — Home and player construction zones

`BuildSystem` now exposes an array of construction anchors rather than one origin.

- Home base anchor: always available after establishment.
- Player anchor: available when a finite tracked world position exists.
- Overlapping anchors are collapsed into one visual zone.

A road segment or intersection is valid when it lies within 85 m of either anchor. Candidate normalization records the nearest authorizing anchor. Confirmation rechecks both anchors and rejects a current-location candidate if the player has moved away.

The construction overlay draws:

- a cyan dashed home-base zone;
- a yellow short-dashed current-location zone;
- valid sites in their union;
- a line from the authorizing anchor to the selected candidate;
- the candidate facility effect range.

No additional road request occurs. Current-location construction therefore operates only on roads already present in the original loaded graph.

## Compatibility

- Save key: unchanged (`frontline_roads_refactor_v2`)
- Schema version: unchanged (`2`)
- Existing v0.18.0 saves: accepted
- Legacy enemy migration: maps old tower-notification data to the new specialist target fields
- Construction costs and defense combat values: unchanged
- Enemy HP, speed, city damage and drops: unchanged
- Base-selection viewport and radar performance profiles: retained

## Verification

- JavaScript syntax checks: passed
- Automated tests: 124 passed, 0 failed
- Twelve-hour simulation: passed
- Deterministic offline simulation: passed
- Migration and save reconstruction: passed
- Source module cycle check: passed
- Service-worker app shell check: passed
