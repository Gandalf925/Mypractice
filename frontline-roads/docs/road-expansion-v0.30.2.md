# Road expansion reliability v0.30.2

## Root cause

Movement acquisition previously depended almost entirely on entering the final 180 m of a 600 m chunk. The initial circular road request also marked fully covered chunks as loaded before the cleaned graph proved that those roads remained available. If center-component cleanup removed disconnected roads, the chunk still looked complete and was never fetched again.

## Correction

- Road chunk state version is now 2.
- New games begin with no assumed movement chunks. The initial graph stays visible, while live movement confirms chunks through the chunk acquisition path.
- Legacy version-1 states retain only chunks evidenced by merged chunk metadata, cache records, surveyed data or explicit empty results. Initial assumed coverage is released for reacquisition.
- Movement acquisition considers the current position, nearby visible terminal nodes, distance from the mapped road network and a 420 m movement lookahead.
- Up to six unresolved chunks are queued per location update, ordered by current position, road frontier and movement direction.
- Failed movement chunks retry after 45 seconds near the frontier. Survey retry behavior remains unchanged.

## Compatibility

Save key and schema version remain unchanged. Existing road graphs, defenses, bases, enemies and civilization progress are preserved.
