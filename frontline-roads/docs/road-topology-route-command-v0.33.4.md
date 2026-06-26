# Road topology and deployment route command — v0.33.4

## Scope

This release repairs road-graph seams without reducing map acquisition, and exposes the existing route planner before a friendly squad is dispatched. The road-expansion hot-path optimization remains part of the same v0.33.4 release.

## Root causes corrected

1. Endpoint clustering compared bridge/tunnel/layer metadata before checking exact OSM node identity. A real bridge portal could therefore be split into two graph nodes when the tag changed at the portal.
2. Chunk merging only joined exact OSM nodes or synthetic endpoints within 1.5m. A clipped road endpoint touching the middle of another road had no operation that could subdivide the target edge into a T-junction.
3. Elevation metadata was not retained by the runtime road graph or compact save. After restore, a road could no longer be distinguished reliably from a bridge or tunnel crossing.
4. Route alternatives and waypoint planning existed for squads already on the map but were not connected to initial deployment.
5. Deployment route planning was treated as though it required an already deployed squad during periodic UI refresh. The planner could close before the user confirmed it.
6. A general reroute notification could replace a manually selected route even when every remaining edge was still passable.
7. A wall placed on an original edge could be bypassed after that edge was subdivided unless the barrier was propagated to all routing descendants.

## Road topology repair

Topology repair runs after initial acquisition, chunk integration, cache restoration and save rehydration. It does not run per frame.

Safe connection rules:

- exact shared OSM node IDs are authoritative, including bridge and tunnel portals;
- clipped terminal pairs may be joined when both endpoints point toward each other and their elevation models are known and equal;
- a clipped terminal may join an existing nearby intersection node under the same directional and elevation constraints;
- a terminal that reaches the interior of another road may create a synthetic T-junction by subdividing that road;
- bridge, tunnel and layer differences prevent coordinate-only joins;
- parallel roads, distinct explicit OSM nodes beyond the strict seam tolerance and grade-separated crossings are not joined.

The original edge remains in the graph as a disabled identity record. Active child edges reference it through `parentEdgeId` and `ancestorEdgeIds`. This keeps existing saves, units and barriers traceable while future routing uses the repaired topology.

## Save and cache handling

The compact road format is now `frontline-road-graph-3`. Default surface-road metadata is omitted from rows, so preserving topology does not expand every edge with a full metadata object. Legacy v1 and v2 road saves remain readable.

Old v0.33.3 chunks have no trustworthy elevation marker. They are not joined speculatively. The road acquisition specification and chunk cache version were advanced to 4, which marks previously acquired areas for gradual refresh around the player and survey facilities. The game state itself is not reset.

## Deployment route selection

For fixed targets, the deployment panel can open map route planning before dispatch. The planner provides up to three distinct choices generated from:

- shortest physical route;
- lower enemy pressure;
- stronger friendly support;
- penalized alternatives when the first strategies collapse to the same path.

The player may add up to two road-node waypoints. Distance, estimated arrival time, predicted contacts and risk are recalculated. The selected node and edge sequence is validated again at dispatch. A new wall or road change that invalidates the path requires the player to select another route instead of silently accepting a different one.

Moving intercept targets continue to use live pursuit replanning because a fixed pre-deployment route would become stale as the target moves.

## Regression coverage

Dedicated tests cover:

- bridge metadata transitions at a shared OSM portal;
- terminal-to-road T-junction creation;
- clipped terminal-to-existing-intersection connection;
- batch cache restoration repairing seams from earlier chunks;
- grade-separated roads remaining disconnected;
- v1/v2 compatibility and compact v3 topology persistence;
- parent-edge walls blocking every subdivision;
- route alternatives and ordered waypoints;
- dispatch following the selected first edge;
- invalid selected routes being rejected after a wall is built;
- periodic UI refresh retaining deployment planning;
- route-planning cancellation callbacks;
- manually selected routes surviving unrelated update notifications;
- legacy roads without elevation data avoiding speculative joins.

## Real-device verification

Automated tests cannot reproduce every OSM tagging error or touch-selection condition. After publishing, confirm on Android that the reported road seams connect, route lines can be tapped, two waypoints can be set and a squad follows the selected route. A genuine bridge or tunnel crossing should remain disconnected unless OSM contains a real connecting node or ramp.
