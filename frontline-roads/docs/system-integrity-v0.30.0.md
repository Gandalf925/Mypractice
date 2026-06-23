# FRONTLINE ROADS v0.30.0 system integrity and progression repair

## Objective

This release resolves the cross-system inconsistencies identified after the v0.29.0 enemy-personality expansion. The work was divided into independent phases so that progression, combat, bases, production and save compatibility could be verified after each change.

## Phase 1 — remove obsolete resource outposts

The old player resource-outpost subsystem had production, rendering and UI code but no valid creation path in a new game. It has been removed rather than reactivated.

- Deleted `src/civilization/outpost-system.js`.
- Removed outposts from the canonical state, production update, renderer, selection UI, data definitions and Service Worker app shell.
- Existing saves remain loadable. A stale `world.outposts` field is discarded during runtime normalization and legacy migration.
- Hostile locations named 前哨基地 remain enemy bases and are not part of the removed subsystem.

## Phase 2 — simple bases and civilization resources

### Simple-base placement

- Location freshness tolerance increased from 60 seconds to 5 minutes so stationary mobile devices do not lose the construction action immediately.
- Placement may snap to a loaded road intersection within 100 m of the current position.
- A completed simple base still provides the intended 50 m construction anchor; the tactical build radius itself was not doubled by this correction.
- UI text now lists assault, skirmisher and retrieval squads as valid simple-base deployments.

### Hostile resource-base rewards

Declared enemy-base rewards were previously never awarded. Immediate destruction rewards were rejected because they made pure offense disproportionately profitable. The final rule is:

1. Destroying a hostile base creates one recovery item at the destruction site.
2. The recovery item contains both its special artifact and the base's declared resource cargo.
3. Resources enter inventory only after manual collection or retrieval-squad delivery.
4. The same cargo cannot be awarded twice.

Resource bases return in 45–75 minutes. Strategic hostile bases retain the existing 4–6 hour replacement interval.

Progression reward values:

| Hostile resource base | Recoverable ore |
|---|---:|
| Copper camp | 120 copper ore |
| Tin camp | 32 tin ore |
| Iron camp | 128 iron ore |

Trial bronze now produces four bronze ingots per run. One copper-camp reward and one tin-camp reward cover the six trial runs required for the Lv.3 project. Two iron-camp rewards cover the 240 iron ore required to produce 30 wrought iron for the Lv.4 project.

## Phase 3 — doctrine and combat consistency

- Wave doctrine now modifies actual target and route behavior rather than serving only as a label.
- Flank doctrine requests a bounded flank route.
- Raid doctrine prefers owned bases.
- Hunt doctrine follows eligible friendly squads.
- Breach doctrine lowers the routing penalty of barriers.
- Resource-base waves participate in doctrine/generation composition changes.
- Evasive enemies now evaluate congestion as documented.
- Tower avoidance uses each defense's live Tier range rather than a fixed 80 m approximation.
- Shield protection uses the declared aura of each shield unit: 30%, 35% and 42%.
- New light and armored enemy types are included in friendly-squad matchup calculations.
- Spawned and legacy-loaded enemies receive their declared visual radius.

## Phase 4 — owned bases, pursuit limits and production constraints

### Additional major bases

- Non-primary major bases are valid hostile objectives.
- Enemies can damage and destroy them.
- A destroyed major base remains as a ruin, occupies its civilization slot and blocks overlapping replacement construction.
- It can be rebuilt on site for 6 timber, 3 rope and 6 cut stone.
- Recovery and target references are cleared or redirected when required.

### Pursuit limits

Hunter and specialist targeting now respects the configured search radius. A target that moves outside the valid radius is abandoned and the enemy returns to normal objective selection.

### Project-only production

The trial-bronze recipe is now genuinely project-only.

- It is available only while the active civilization project still needs bronze.
- Queued quantity is capped to the remaining contribution.
- Completed output is deposited directly into project contributions.
- It cannot be overproduced into ordinary inventory after the target is complete.

## Phase 5 — progression and regression verification

Dedicated verification covers:

- complete removal of active outpost runtime paths;
- legacy outpost-field disposal;
- practical simple-base placement;
- one-time recovery of hostile-base resources;
- 45–75 minute resource-base replacement;
- real copper/tin/bronze and iron/wrought-iron production chains;
- doctrine-driven routing and resource-base composition;
- Tier-aware tower avoidance;
- shield values and friendly matchups;
- bounded squad hunting;
- secondary major-base destruction, persistence and rebuild;
- enemy visual radius and corrected base-command copy.

The save key remains `frontline_roads_refactor_v2` and the schema remains version 2.
