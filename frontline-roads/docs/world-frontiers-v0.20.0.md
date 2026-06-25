# FRONTLINE ROADS v0.20.0 — World frontiers

## Objective

Turn the fixed startup road area into an expanding location-based world, make the unknown edge an actual enemy front, and keep the growing world within practical mobile processing and storage limits.

## Phase 1 — Road chunk foundation

- The world is divided into deterministic 600 m chunks.
- Chunk requests use the original map center as their shared projection origin.
- Incoming graph nodes merge by compatible coordinate proximity while existing IDs remain unchanged.
- Duplicate endpoint-pair roads merge metadata instead of creating overlapping gameplay roads.
- IndexedDB stores compact per-world chunk payloads.
- Failed chunks enter a cooldown and are not requested on every GPS update.

Phase result: 129 automated tests passed.

## Phase 2 — Movement-driven expansion

- The current chunk is always eligible for loading.
- Adjacent chunks are prefetched only when the player approaches the relevant boundary.
- Requests run serially to avoid Overpass bursts and graph-write races.
- The renderer, construction sites, exploration sites and frontier state refresh after graph integration.
- The recenter control centers on the latest player world position during play.

Phase result: 134 automated tests passed.

## Phase 3 — Unknown frontiers

- Degree-one roads near an unobserved boundary become frontier entries.
- If a terminal lies near multiple chunk boundaries, its outgoing road vector chooses one direction instead of duplicating the same front.
- Each source receives a fixed world coordinate, profile, threat and spawn interval.
- Expanding the road graph advances the entry node toward the source without moving the source itself.
- Enemies spawn through existing combat and wave records from the current edge entry.

Phase result: 139 automated tests passed.

## Phase 4 — Source discovery and field sites

- Loading a source chunk materializes one persistent enemy-source objective on the nearest valid road node.
- Interaction requires the player to be within 50 m.
- Source-linked enemies within the local safety radius block the operation.
- Leaving the site pauses the operation without deleting progress.
- Completion clears the source, awards resources and prevents further waves from that source.
- Deterministic ambient sites add supply, survivors, communications, resource, and lookout outcomes.

Phase result: 144 automated tests passed.

## Phase 5 — Regional simulation, spatial queries and compact saves

- Active combat within 900 m of the city or player runs every tick.
- Peripheral combat within 2,400 m runs in two-second batches.
- More distant combat runs in eight-second batches and becomes active immediately when approached.
- Road graph indexes provide local node and edge queries for rendering, construction and exploration.
- Frontier reconciliation scans terminal nodes rather than every road node.
- Save data encodes road nodes and edges as compact arrays and reconstructs canonical graph objects on load.
- Existing object-form saves remain supported.

Phase result: 149 automated tests passed before final release cleanup. The completed release passes 150 tests after obsolete routing code removal and save-compatibility coverage.

## Final release verification

- JavaScript syntax checks passed for all source and test modules.
- 150 automated tests passed with 0 failures.
- All 78 production source modules are reachable from the application entry point.
- No missing local imports, circular imports, duplicate HTML IDs, empty source/test files or CSS brace errors were found.
- The service-worker app shell contains every production runtime module.
- The obsolete standalone road pathfinder was removed; graph routing tests now exercise the active combat routing system.

## Compatibility

- Save key remains `frontline_roads_refactor_v2`.
- Schema version remains `2`.
- Existing v0.19.0 saves are accepted.
- Existing defense costs, enemy combat statistics and civilization requirements are unchanged.
- Road chunk caches are isolated by rounded world origin.
- Exact live position and location accuracy are still removed from local-storage saves.

## Browser verification limitation

Headless Chromium was attempted after each phase. In this execution container it did not reach DOM loading because netlink, DBus and inotify access are restricted. No application JavaScript exception or missing HTTP asset was reported. See `browser-test-limit-v0.20.0.md`.
