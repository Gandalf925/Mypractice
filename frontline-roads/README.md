# FRONTLINE ROADS — modular source v0.22.1 tactical orders

FRONTLINE ROADS is a location-based, continuously progressing road-defense strategy game. This directory is the canonical modular development source.


## Tactical squad orders v0.22.1

This maintenance phase adds direct command and route selection for deployed friendly squads. Facility tier phase 2 remains intentionally unstarted.

- `停止` holds the squad at its exact current road position while preserving its mission. Nearby enemies can still engage it.
- `後退` lets the player select a valid fallback intersection, compare up to three routes and add up to two waypoints. Arrival changes the squad to a stopped state without discarding the attack mission.
- `進軍再開` recalculates routes from the squad's current position to the held retreat destination or original enemy base, then waits for explicit confirmation.
- `撤退` lets the player choose the return route to the origin base. Confirmation permanently discards the current attack mission.
- Route choices expose distance, ETA, known enemy contacts and risk. Candidate generation includes shortest, enemy-avoidance and friendly-support weighting when distinct routes exist.
- Commands issued mid-edge preserve the exact position and finish the current road segment before entering the selected route; no map teleport is used.
- Retreating and withdrawing squads do not attack while evading, but remain vulnerable to enemy attacks.
- Command, route, destination and bounded travel-history state persist through save/restore and use the same regional simulation clocks as other remote combat.
- Retreat-destination markers are validated only for visible road nodes, avoiding a full-world node scan on expanded maps.

Detailed behavior and regression boundaries are documented in `docs/tactical-orders-v0.22.1.md`.


## Combat balance foundation v0.22.0

This release contains phase 1 of the agreed progression roadmap. Later facility tiers, forward bases, surveying, additional squad classes, recovery facilities and recovery squads are intentionally not included yet.

### Tier-zero defense correction

- The tier-zero area tower now has 90 m range, 18 direct damage, 16 s reload and an 18 m blast radius.
- One target receives full damage. Nearby targets receive 60% damage, with a hard cap of three targets per shot.
- Its opening cost is now wood 50, stone 60 and fiber 18, preventing two immediate area towers from the initial stockpile.
- The tier-zero slow trap now applies 25% slowing for six seconds to at most three targets, with an eight-second reload.
- Higher area and slow tiers follow restrained growth curves through tier 4.
- The single-target tower line is unchanged.

### Enemy-base and enemy-unit levels

- Hostile bases mature at 20, 60, 120 and 240 minutes, up to level 5.
- The maximum hostile-base level is civilization level + 2, capped at 5.
- Civilization grace periods delay the newly unlocked hostile-base cap.
- Every enemy records the source-base level at spawn; existing enemies never change level in the field.
- Levels increase HP, attack and speed by controlled multipliers. Speed rises by at most 10% at level 5.
- Higher-level bases add exactly one unit per level and shorten sortie intervals only from level 3 onward.
- New civilization-generation enemies phase in at 15, 30, 45 and 60 minutes while previous-generation enemies remain present during the transition.
- Enemy selection details display the actual level and scaled speed and damage.

### Balance reference

Automated straight-road scenarios verify that a level-two mixed wave can now penetrate a tier-zero area-plus-slow defense and damage the city, while the same setup still survives the reference wave. Full values and verification notes are in `docs/combat-balance-v0.22.0.md`.

## Readable UI maintenance release v0.21.1

- HUD, buttons, context panels, modals and base command text increased by roughly 1–2 px.
- Canvas labels increased separately without changing map zoom or world scale.
- Tool buttons and lower context clearance expanded to prevent overlap.
- Gameplay, saves, road chunks, combat and expeditionary command behavior are unchanged.

## Expeditionary command v0.21.0

### Attack squads

Player bases can deploy one aggregate assault squad at a time.

- The deployment panel selects an origin base and a discovered living enemy base.
- The preview shows route distance and resource cost without changing state.
- On confirmation, resources are consumed once and the squad physically follows the road graph.
- Squads stop to exchange damage with enemies, attack the target base, then return to their origin if survivors remain.
- Remote squads use the same peripheral and dormant simulation intervals as the rest of the expanded world.
- Squad state, route and origin survive save and restore.

### Enemy-base destruction and field recovery

Enemy bases are no longer captured by standing nearby. They are destroyed only by deployed player squads.

- A destroyed base stops spawning waves and receives a deterministic four-to-six-hour respawn schedule.
- Exactly one special recovery item remains at the destroyed base position.
- The item persists across restarts until collected and is removed from save data after recovery.
- Collection is manual and requires the player to remain within 40 m for five seconds with a position update no older than 60 seconds and accuracy of 100 m or better.
- Exact player coordinates and location freshness are never written to the save.
- Recovered artifact totals are cumulative civilization-development requirements.

### Civilization levels and multiple player bases

The player-base limit is `civilization level + 1`.

- Level 0 supports one base, level 1 supports two, and level 4 supports five.
- A new base requires an unlocked slot, a fresh physical position, a discovered road intersection within 50 m, and at least 220 m separation from every existing base.
- Every established base becomes a construction anchor, regional-simulation anchor and assault-squad origin.
- Secondary bases use distinct radar markers and are persisted without exact geographic coordinates.

### Base command and map switching

`BASES // 拠点` opens the base command panel.

- Every established base displays HP, nearby enemies, nearby defenses, deployed squads and nearby uncollected items.
- `この拠点をMAP表示` moves only the map camera; it never changes the player's physical position.
- When a base slot is available, the same panel can establish a new base at the player's verified current location.

## World frontiers retained from v0.20.0

- The initial road graph loads around the player's first position.
- Approaching 600 m chunk boundaries acquires and merges additional OSM roads without replacing existing graph IDs.
- Acquired chunks are cached in IndexedDB and restored without duplicate requests.
- Unobserved road edges form persistent frontier signals and fixed hostile source positions.
- Active, peripheral and dormant regions run at full-tick, two-second and eight-second intervals.
- Road rendering, construction search and exploration use non-serialized spatial indexes.
- Compact road-graph saves remain compatible with v0.19.0 object-form data and v0.20.0 saves.

## Construction

Construction is a two-stage operation. A map tap selects a candidate and confirmation performs the mutation.

Valid construction zones are the union of:

- the 85 m radius around every established player base; and
- the 85 m radius around the latest tracked player position.

The map shows valid roads or intersections, the authorizing zone and the real effect radius. Confirmation revalidates position, occupancy and resources.

## Architecture

- `src/app`: startup, lifecycle, game loop and PWA registration
- `src/core`: state schema, store, events and shared constants
- `src/location`: geolocation and coordinate conversion
- `src/roads`: road acquisition, chunks, merging, graph indexes and routing
- `src/exploration`: frontiers, discovery sites and field recovery
- `src/base`: initial placement, player-base limits and physical base establishment
- `src/combat`: enemies, player squads, waves, construction and defenses
- `src/civilization`: resources, facilities, production and progression
- `src/persistence`: compact saves, migrations, road cache, offline simulation and tab ownership
- `src/rendering`: radar, roads, tactical overlays and effects
- `src/ui`: base command, deployment, combat, civilization and menu controls
- `tests`: regression, long simulation, persistence, rendering and shell validation

## Privacy

- Precise movement history is not persisted.
- Current latitude and longitude are removed from saves.
- Base records store only projected world coordinates and road-node IDs; any temporary geographic location field is removed before saving.
- Map origins are rounded before persistence.
- Current coordinates are sent to the road data service only when initial or additional road acquisition is required.

## Verification

Run:

```bash
npm run verify
```

The release archive contains the complete modular source and tests. Browser-launch attempts in the build container are documented under `docs/browser-test-limit-v0.22.1.md`; final GPS, Overpass and mobile-layout checks must be performed on the deployed HTTPS page.
