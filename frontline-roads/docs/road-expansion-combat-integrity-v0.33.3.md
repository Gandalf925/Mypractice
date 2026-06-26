# Road expansion and combat integrity — v0.33.3

## Scope

This correction integrates the initial-road acceleration with the v0.33.2 tactical-build optimization without reducing map expansion, road completeness or combat pressure. It replaces the earlier v0.33.3 candidate; there is only one production v0.33.3 code path.

## Player-driven map expansion is preserved

Combat connectivity and road acquisition are separate concerns.

`RoadWorldManager.considerLocation` continues to evaluate the player's live world position on each location update. It queues acquisition when any of these conditions apply:

- the player approaches a loaded chunk boundary;
- the player approaches an outer road terminal;
- the player moves away from the previous location toward an unknown chunk;
- the player is farther than the allowed off-network distance from known roads;
- the forward look-ahead point reaches an unknown chunk;
- a recent frontier acquisition failed and the shorter movement retry cooldown has elapsed.

The connectivity cache is not consulted by this method. A regression test repeatedly exercises the combat cache before moving to a road endpoint and verifies that the forward chunk is still queued.

## Connectivity work is no longer repeated every combat frame

`reachableRoadNodeIds` stores the settlement-connected node set against:

- the road graph object;
- the graph's topology revision;
- node and edge counts;
- the current adjacency index;
- the sorted settlement-node set.

Road merges increment `topologyRevision`. Restored or rebuilt indexes replace the adjacency object. Either change invalidates the cache before the next combat or frontier check.

A synthetic 20,000-node chain benchmark in this container measured 100 full traversals at 505.41ms and 100 cached calls at 0.034ms, a 99.99% reduction. This is a deterministic CPU benchmark, not an Android frame-rate claim.

## Initial preview fallback is safe near the selection boundary

The primary 1,500m acquisition and 1,250m retention rules remain unchanged. The 1,150m preview is shown only when the primary request is slow.

If the primary request ultimately fails, the preview remains usable, but combat does not start immediately after confirmation. The selected point is surrounded by a mandatory 420m chunk-coverage request. The request:

1. includes every chunk intersecting the selected area;
2. waits for loaded or independently confirmed-empty results;
3. keeps the selection and allows retry after a failure;
4. re-snaps the selected point to the integrated graph;
5. establishes the base only after the area is confirmed.

This preserves the full 1,000m selection radius without creating a base against a thin 50m preview edge.

## Frontier advance and enemy position integrity

Frontier candidates must be physically reachable from the city or an active player settlement. Disconnected road fragments remain in the graph for later map merging.

When the map expands:

- the off-map source point remains fixed, preserving the direction and identity of that front;
- the entry used by future waves may advance to a newly acquired outer terminal, so expansion continues to push the front outward;
- a normal valid advance does not relocate enemies that already exist, including units still waiting to depart;
- if a legacy entry is missing or disconnected, only a unit still waiting at that invalid entry may be moved to the repaired reachable entry;
- an enemy that already departed always keeps its current node and route position;
- route planning reacts to the new topology without visible teleportation.

## Staged route recovery

A route failure is tracked against the road topology revision.

1. A topology change resets the failure timer and immediately retries.
2. After 8 seconds, stale target and route state is cleared and replanned.
3. A waiting unit may be reattached to its current source if that source moved during legacy repair.
4. A unit is retired only after 45 seconds and only when both its current node and current source remain disconnected from every active settlement.
5. Retirement closes wave membership without awarding a perfect-defense result.

A temporarily route-less unit already on a settlement-connected node is retained.

## Wave integrity under population pressure

Before wave limits are evaluated, active records are reconciled with living unresolved enemies.

- missing records are reconstructed;
- stale records are removed;
- remaining counts are corrected;
- source, doctrine, guard status and start time are retained where available.

If the population cap prevents every unit from spawning:

- no wave record is created;
- no launch message or launch event is emitted;
- enemy-base `wavesSent` does not increase;
- frontier `wavesSent` does not increase;
- a guard wave is not marked as already used;
- the source retries after 12 seconds rather than losing its full interval.

Partial launches record the actual spawned count.

## Service-worker release integrity

The current service worker reads application assets only from its named v0.33.3 cache. It does not search all caches and does not use query-insensitive matching. A request carrying another release version cannot fall back to the canonical current-cache key.

An early registration promise starts the update before the module graph loads. The normal PWA module reuses that promise instead of registering a second worker. `controllerchange` performs one guarded reload for the current release. Local development fixtures remain exempt.

## Long-run regression

A deterministic ten-minute combat test expands one connected road front twice while enemy bases and frontier systems remain active. It verifies:

- the new far endpoint becomes settlement-reachable;
- enemies actually move;
- enemy bases continue launching;
- live enemy counts and active wave records remain identical;
- no connected enemy reaches the disconnected-fragment retirement path;
- no frontier source retains a disconnected entry;
- no enemy is abandoned during valid connected expansion.

## Compatibility

- Save key: `frontline_roads_refactor_v2`, unchanged.
- Schema version: 2, unchanged.
- Complete initial query radius: 1,500m, unchanged.
- Complete retention radius: 1,250m, unchanged.
- Supported OSM road classes and source identities: unchanged.
- Parallel roads, disconnected major roads and chunk-boundary roads: preserved.
- Player movement and survey-facility acquisition: preserved.
- Combat density and balance constants: unchanged.
