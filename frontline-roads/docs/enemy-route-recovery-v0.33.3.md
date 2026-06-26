# Enemy route and wave recovery — v0.33.3

## Reported failure

A frontier could select a terminal on a disconnected OSM fragment. Enemies spawned there had no settlement route, stayed at `NO ROUTE`, and kept their wave records active. During the opening grace period, two such records occupied the active-wave limit and prevented nearby enemy bases from launching.

## Corrected entry selection

Frontier candidates and active source entries must belong to the road component reachable from the city or an active player settlement. Disconnected roads remain rendered, saved and eligible to become usable after later road merging.

The off-map source point remains fixed during map expansion, while the entry used by future waves advances toward newly acquired outer terminals. Existing enemies are not moved by that normal advance. Reconciliation relocates a still-waiting enemy only when its legacy entry is missing or disconnected.

## Existing-save repair without teleportation

When a legacy entry is invalid:

- the source receives a reachable replacement entry;
- an enemy that is still waiting may move with the source;
- its stale route state is cleared and replanned;
- an enemy that already departed keeps its physical position.

No save reset is required.

## Route recovery

Route recovery is topology-aware and staged:

- road-topology changes trigger an immediate retry;
- after 8 seconds, stale strategic targets are cleared;
- waiting units can reattach to a repaired source;
- retirement occurs only after 45 seconds of continued failure and only if the unit and its current source are both disconnected from every active settlement.

A connected but temporarily route-less unit is not removed. Retirement does not count as a perfect defense.

## Wave repair and capacity handling

Active wave records are rebuilt from living unresolved enemies before launch limits are checked. Missing records are recreated and stale records are removed.

A launch that creates zero units because the population cap is full does not:

- create a wave record;
- increase `wavesSent`;
- emit a launch message;
- consume a one-time guard launch.

The source retries after 12 seconds. Partial launches use the actual number created.

## Regression coverage

The v0.33.3 route, wave and long-run tests cover disconnected candidates, legacy source repair, waiting versus departed units, staged retirement, connected no-route retention, missing record reconstruction, zero-unit enemy-base/frontier/guard launches, nearby-base recovery and two live road expansions during a ten-minute combat simulation.
