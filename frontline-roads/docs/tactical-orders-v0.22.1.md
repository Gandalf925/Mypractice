# FRONTLINE ROADS v0.22.1 — Tactical Squad Orders

This release is phase 1.5 between combat balance phase 1 and facility-tier phase 2. It does not add facility tiers, forward bases, surveying facilities, additional squad classes, healing facilities or recovery squads.

## Commands

### Stop

- Applies immediately at the squad's exact current road position.
- Preserves the current route, mission target and command destination.
- Does not prevent nearby enemies from engaging or damaging the squad.
- A stopped squad does not pursue enemies or move on its own.

### Retreat

- The player first chooses a road intersection that is farther from the current hostile base than the squad's current command-start node.
- An established player base is always a valid fallback destination when reachable.
- The planner produces up to three distinct choices: shortest, lower known-enemy exposure and greater friendly-defense support.
- The player may add up to two explicit road-intersection waypoints.
- Arrival changes the squad to `HOLD`; the original attack mission remains available for route-selected resume.

### Resume

- Resume does not automatically reuse a stale route.
- The route is rebuilt from the squad's current command-start node.
- If a retreat was stopped before reaching its destination, resume continues toward the held retreat destination.
- After retreat arrival, resume targets the original living hostile base.

### Withdraw

- The destination is the squad's deployment base.
- The player selects the return route and may add up to two waypoints.
- Confirmation clears the attack mission and is irreversible.
- The squad is removed only after physically reaching the origin base.
- A rejected or stale route never clears the existing mission.

## Route and movement rules

- Mid-edge commands keep the squad at its exact interpolated position.
- The squad completes the current edge to the next intersection, then enters the confirmed route.
- Every submitted route is validated against the current graph: node count, edge count, start, destination and every adjacent edge must match.
- Route choices display physical distance, ETA, known enemy contacts and low/medium/high risk.
- Unobserved enemy information is not used in the displayed risk estimate.
- Route overlays and destination candidates are restricted to the visible spatial-index window; expanded worlds are not scanned in full when the command panel opens.

## Combat behavior

- `RETREAT` and `WITHDRAW` are evasive orders: the squad does not stop to attack.
- Enemies encountered at close range can still target and damage the moving squad.
- `HOLD` squads continue fighting enemies already in contact.
- Command changes do not teleport a unit or erase damage already being resolved.

## Persistence and compatibility

The following fields are normalized on old saves and persisted on new saves:

- current order;
- mission target;
- current command destination;
- held order and held destination;
- selected road path and progress;
- recent road-node travel history, capped at 96 nodes.

The save key and schema number remain unchanged. Older v0.19–v0.22 saves without these fields are normalized to the existing advance/return behavior.

## Regression coverage

Automated tests cover:

- exact-position stop;
- no mid-edge teleport;
- selected retreat destination and arrival stop;
- irreversible withdraw and physical return;
- stopping and resuming a retreat;
- retreat-destination validation;
- distinct route generation;
- mandatory waypoints;
- vulnerability while retreating;
- save and restore;
- rejected routes preserving the mission;
- rejection of graph-inconsistent routes;
- Canvas overlay rendering and renderer layer order.
