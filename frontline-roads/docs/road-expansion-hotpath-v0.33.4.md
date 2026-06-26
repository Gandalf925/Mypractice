# Road expansion hot-path optimization — v0.33.4

## Scope

v0.33.4 optimizes the CPU-side path used while the player moves through an already acquired road world and when cached road chunks are restored. It does not reduce the road acquisition radius, road classes, chunk candidates, retry behavior, player-observation rules, survey coverage, or map-expansion frequency.

The following acquisition triggers remain active:

- approaching a road-chunk boundary;
- approaching an outer road terminal;
- moving away from the known road network;
- continuing toward an unacquired direction;
- look-ahead acquisition in the measured travel direction;
- retrying failed frontier requests after the movement cooldown;
- survey-facility road acquisition.

## Removed work

### Position updates

The GPS callback previously opened a cloning transaction for the complete game state and `RoadWorldManager.considerLocation()` immediately created another detached snapshot. Both operations copied the complete road graph even when only four player-location fields changed.

The callback now computes one world point, applies the four location fields through the in-place simulation update path, and passes that point directly to the road-expansion manager. The manager reads the current state without cloning it.

### Frontier geometry

Road bounds are now generated with the road graph indexes and retained as a non-serializable runtime index. Outer-terminal lookup uses the existing spatial buckets around the player instead of scanning every terminal or recomputing the complete graph bounds on each location event.

### Chunk membership

The saved road-chunk format remains arrays for compatibility. Runtime-only `Set` indexes now provide membership checks for loaded, empty, cached, integrated, refresh, player-observed and surveyed chunks. The indexes are non-enumerable and therefore do not enter save JSON.

### Road integration

New road chunks are merged through the owned in-place road update path instead of cloning the entire game state. Cached chunks are read together and restored in one state update. Graph indexes are rebuilt once after the final cached chunk rather than once per restored chunk.

Entering a previously acquired chunk still records physical observation and runs exploration/front reconciliation. It no longer invalidates and redraws static road geometry because observation does not change topology.

## Benchmark

The benchmark uses synthetic road graphs to isolate CPU work. It is not an Android-device, GPS, network, or live Overpass result. v0.33.3 and v0.33.4 were measured from their respective release source trees in the same Linux/Node.js environment. Values are medians of four rounds.

| Road nodes | v0.33.3 per location update | v0.33.4 per location update | Reduction |
|---:|---:|---:|---:|
| 2,000 | 35.2526 ms | 0.0597 ms | 99.831% |
| 5,000 | 105.8817 ms | 0.0376 ms | 99.964% |
| 10,000 | 236.2386 ms | 0.0389 ms | 99.984% |

Restoring twelve cached chunks into a 3,000-node graph changed from a 359.891 ms median to 109.750 ms, a 69.505% reduction. The final value includes one conservative topology-seam validation pass after the batched merge; the previous candidate’s lower restore number did not include that correctness work.

The unusually large location-update reduction is expected: the old path was proportional to the complete saved game and road graph, while the new steady-state path is bounded by nearby spatial buckets and a small set of chunk candidates.

Raw comparison data is stored in `docs/road-expansion-hotpath-v0.33.4.json`. The reproducible current-version benchmark is `tools/benchmark-road-expansion-hotpath-v0334.mjs`.

## Regression guarantees

Dedicated coverage verifies that:

- location-driven expansion does not call `snapshot()`;
- road integration does not call the cloning transaction path;
- cached chunks restore through one state update;
- runtime chunk indexes remain absent from save JSON;
- approaching a visible terminal still requests forward chunks before a grid boundary;
- movement look-ahead remains active;
- short frontier retry cooldowns remain active;
- look-ahead chunks stay hidden until the player physically enters them;
- player movement and survey facilities still use the complete production acquisition stack;
- road expansion remains coherent during the ten-minute combat simulation.
