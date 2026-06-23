# Enemy personalities and civilization variants v0.29.0

## Scope

The enemy system now separates numerical combat statistics from behavioral intent. Each definition points to a personality profile used by route planning, target selection and UI presentation.

## Personalities

- Direct: shortest-road city pressure.
- Evasive: avoids tower coverage and congestion.
- Flanker: searches for a laterally separated alternative route, bounded by a maximum detour ratio.
- Breacher: accepts barriers and favors short frontal routes.
- Saboteur: targets support and weapon facilities.
- Marauder: prioritizes simple bases and forward support.
- Hunter: dynamically tracks active friendly squads.
- Support / Commander: provides nearby speed support without stacking multiple auras.
- Guardian: high durability and shield-aura protection.

## New civilization variants

| Civilization | New enemies | Tactical role |
|---|---|---|
| Lv.1 | Pathfinder Scout, Marauder | Long flank and simple-base raid |
| Lv.2 | Sapper, Pillager | Barrier demolition and forward-support destruction |
| Lv.3 | Flank Rider, War Drummer | Fast long flank and speed support |
| Lv.4 | Squad Hunter, Iron Saboteur, Iron Guard | Friendly-unit pursuit, rear-facility destruction and heavy escort |

## Route safety boundaries

Flanking performs a normal tactical search, a flank-biased search and a raw shortest-distance check. The alternative is accepted only when it differs from the baseline, has meaningful lateral separation and remains inside the unit's configured maximum distance ratio. If the road network has no suitable alternative, the unit falls back to the existing evasive route.

Route planning still occurs only when an enemy receives a route, loses a target or reaches a safe reroute node. It is not recalculated every frame.

## Compatibility

The save key and schema version remain unchanged. New fields (`doctrineKey`, `targetSquadId`, route presentation metadata) are optional. Existing enemies derive behavior from their type when loaded.
