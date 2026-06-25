# Survey network v0.25.0

## Scope

This release implements phase 4 only. Additional squad classes, squad recovery facilities and recovery squads are not included.

## Unlock and construction

Survey towers unlock at civilization level 1 and start at Tier 1. They can be built only inside a living major-base or simple-base construction zone, never from the player-position zone alone. Each owned base may operate one active survey tower.

| Tier | Name | Survey radius | Chunk interval |
|---:|---|---:|---:|
| 1 | 木製測量塔 | 600 m | 180 s |
| 2 | 石造測量塔 | 900 m | 150 s |
| 3 | 青銅測量塔 | 1,200 m | 120 s |
| 4 | 鉄製測量塔 | 1,600 m | 90 s |

The normal defense-tier upgrade flow applies. Damage percentage is preserved during upgrades.

## Road acquisition

A due tower selects one adjacent unloaded 600 m road chunk inside its radius. Acquisition uses the existing Overpass road service, graph merge and IndexedDB cache. Only one chunk request is processed at a time. Across all towers, a new survey request cannot begin within 30 real seconds of the preceding survey request. Recently failed chunks retain the existing retry cooldown, while unrelated chunks remain eligible.

A tower attached to a destroyed simple base is inactive until the base is rebuilt. Ruined or disabled towers do not schedule scans.

## Information boundary

Road chunks track two distinct states:

- `surveyed`: roads obtained remotely by a survey tower;
- `playerObserved`: regions physically entered by the player.

Remote surveying reveals road geometry, connections and unidentified frontier signals. It does not materialize exact frontier-source sites, ambient exploration sites or exact hostile-base placements. Enemy-base spawning and respawning use physically observed road chunks only.

When the player physically enters a surveyed chunk, it is promoted to `playerObserved`. Eligible local sources and exploration sites are then reconciled normally.

## Persistence and compatibility

Surveyed and physically observed chunk sets, tower schedule, last chunk and completed count are saved. Old saves have no surveyed chunks and treat their already loaded chunks as physically observed, preserving prior behavior. The save key and schema version are unchanged.

## API and performance controls

Candidate enumeration uses the fixed chunk grid rather than scanning the road graph. Duplicate pending requests are rejected. Network and cache integration reuse the existing serialized road queue. A single failed direction does not stop acquisition in other directions.
