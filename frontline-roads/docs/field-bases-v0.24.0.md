# Simple field bases v0.24.0

## Scope

This release implements phase 3 only. It does not add surveying facilities, new squad classes, healing or recovery squads.

## Limits and role

The major-base limit remains `civilization level + 1`. Simple bases use a separate limit equal to civilization level:

| Civilization | Major bases | Simple bases |
|---:|---:|---:|
| 0 | 1 | 0 |
| 1 | 2 | 1 |
| 2 | 3 | 2 |
| 3 | 4 | 3 |
| 4 | 5 | 4 |

A simple base has 40 maximum HP, a 50 m construction zone and can currently deploy only the existing assault squad. Major bases retain 100 HP, an 85 m construction zone and their full deployment role.

## Placement

Placement is a deliberate onsite action and requires all of the following:

- civilization level 1 or higher;
- an unused simple-base slot;
- a position update no older than 60 seconds;
- reported accuracy of 100 m or better;
- a discovered road intersection within 50 m;
- at least 140 m separation from every active major base and every active or destroyed simple-base site;
- at least 120 m separation from every living hostile base.

Simple-base establishment does not consume a new resource bundle in this phase. The existing major-base system also has no establishment cost, and no unapproved economy cost was introduced.

## Construction and current location

Every living simple base contributes a 50 m construction anchor. It is visually distinct from the 85 m major-base and current-position anchors.

The current-position anchor remains independent. When the player stands directly on a simple base, both anchors coexist, so the player's 85 m construction ability is not accidentally reduced to 50 m.

## Enemy interaction

Living simple bases are possible settlement targets. Enemy route selection compares travel cost and applies a priority penalty so that an enemy attacks a simple base only when it is meaningfully closer than the city. A distant simple base does not pull an invasion away from a nearby city.

An enemy reaching a simple base deals its normal settlement damage once and is resolved in the same way as a city breacher. At zero HP the simple base becomes a ruin.

## Destruction and rebuilding

A destroyed simple base:

- remains in the player's simple-base slot count;
- no longer provides a construction anchor;
- cannot dispatch an assault squad;
- no longer keeps its region in the high-frequency simulation zone;
- remains visible as a `RUIN` marker;
- blocks overlapping major-base placement so the site cannot be silently replaced.

Rebuilding requires a fresh valid position within 50 m of the original site and restores the base to 40 HP. Rebuilding does not create a new slot or a duplicate base.

## Map and command UI

The base command screen lists major and simple bases separately. Each simple-base card shows HP, nearby enemies, nearby defenses, deployed squads and nearby recovery items. The map camera can focus a living simple base or a ruin without changing the player's physical position.

Radar markers use `FIELD` for living simple bases and `RUIN` for destroyed sites.

## Save compatibility and privacy

`world.fieldBases` is additive. Existing secondary player bases remain major bases when an older save is loaded; none are converted automatically. Exact GPS coordinates and location freshness are not persisted. Simple bases save only gameplay world coordinates and road-node identity, consistent with the existing privacy model.
