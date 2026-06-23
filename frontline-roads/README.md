# FRONTLINE ROADS — modular source v0.29.0 enemy personalities

FRONTLINE ROADS is a location-based, continuously progressing road-defense strategy game. This directory is the canonical modular development source.

## Enemy personalities and civilization variants v0.29.0

This release turns the existing route and target flags into a coherent enemy-behavior layer and expands every civilization generation.

- Every enemy now resolves through an explicit personality: direct, evasive, flanker, breacher, saboteur, marauder, hunter, support, guardian or commander.
- True flanking units use a bounded alternative-road search. They may accept a longer route only when it remains inside their configured detour ratio and produces meaningful lateral separation from the shortest line.
- Civilization Lv.1 adds Pathfinder Scouts and Marauders; Lv.2 adds Sappers and Pillagers; Lv.3 adds Flank Riders and War Drummers; Lv.4 adds Squad Hunters, Iron Saboteurs and Iron Guards.
- Waves receive deterministic doctrines such as frontal assault, flank attack, raid, siege breach, coordinated advance and squad hunt. Doctrine affects which civilization-generation specialists replace the base formation.
- Marauders can prioritize simple bases, saboteurs target support and fire facilities, squad hunters dynamically track friendly road units, and War Drummers/commanders provide non-stacking speed support.
- Selecting an enemy now displays its personality, wave doctrine, actual route mode, detour percentage and current objective.
- Existing saves remain compatible; missing personality, doctrine and target fields are inferred from the enemy type at runtime.

Implementation details and verification boundaries are documented in `docs/enemy-personalities-v0.29.0.md`.



## Context panel stability v0.28.5

This release uses repeated deterministic playthroughs to correct progression blockers and strategy dominance without adding a parallel rules layer.

- Civilization Lv.1 now asks for one barrier, two basic attack towers, 20 enemy kills, one hostile-base destruction, one recovered artifact and a smaller contribution bundle. Balanced openings complete in roughly 22–33 minutes across line, cross and grid road networks.
- Initial hostile bases spread across independent road fronts where the road graph permits it. When several bases must share one front, their first launches are staggered and their sustained intervals are widened instead of stacking all pressure at the opening.
- A hostile base launches its own composition as a one-time guard force when first attacked. Guard encounters do not count toward the perfect-defense streak.
- The city begins passive reconstruction after 120 seconds without damage at 0.08 HP per second. A city defeat also resets live enemy-base launch clocks, preventing immediate defeat loops.
- The Lv.4 project now requires three active simple bases instead of the obsolete captured-outpost counter.
- Additional major and simple bases now consume escalating processed-resource costs. Simple-base rebuilding also consumes a small fixed cost.
- The release includes deterministic balanced-opening and attack-only regression playthroughs in `tests/game-balance-regression.test.js`.

Full findings, values and test-play results are documented in `docs/ui-range-refinement-v0.28.3.md`.

## Contextual deployment UI v0.28.1

This corrective release replaces the global deployment entry point with target-first map interaction.

- The upper HUD no longer contains a global `DEPLOY // 派兵` button.
- Selecting a live hostile base opens a compact lower target panel with `この敵拠点へ派兵`.
- The deployment panel receives and locks the selected hostile base; the player chooses only the squad type and origin base.
- Selecting an available recovery item exposes both direct GPS collection and `回収部隊を派遣`, preserving the phase 7 remote-recovery path without restoring the global button.
- Target context panels use a constrained height and sticky action row so they remain above the defense toolbar without covering most of the map.
- The deployment panel is compact, side-aligned on wider screens and height-limited above the toolbar on mobile layouts.
- Existing combat, recovery, save data and remote simulation rules are unchanged.

Full behavior and regression boundaries are documented in `docs/contextual-deployment-v0.28.1.md`.

## Retrieval corps v0.28.0

This release completes phase 7 by adding a deliberately vulnerable remote-recovery option while preserving direct player collection.

- The retrieval squad is available from civilization Lv.0 at major and simple bases. It has 55 HP, 1.2 enemy DPS, no hostile-base damage and a low-cost three-member formation.
- Dispatching reserves one available recovery item. A player cannot collect the same item while the squad is assigned, and an active player collection blocks squad deployment before any resource or garrison mutation.
- The squad travels on the road graph, remains vulnerable to normal enemy combat, waits eight seconds at the recovery point, then physically returns to its origin or a surviving major base.
- Artifacts are credited only after the carrying squad reaches a base. Pickup alone does not increase civilization inventory.
- Destruction before pickup releases the item at its original point. Destruction while carrying drops it at the squad's exact road position for later player or squad recovery.
- Withdrawal before pickup abandons the assignment and releases the item. Orphaned reservations are automatically recovered if squad data is lost.
- Recovery missions support stop, route-selected retreat, resume and withdrawal rules, save/restore, simple-base reorganization and active/peripheral/dormant simulation.
- Manual five-second GPS collection remains the faster and safer option when the player can physically reach the site.

Full behavior and regression boundaries are documented in `docs/retrieval-corps-v0.28.0.md`.

## Squad recovery and reorganization v0.27.0

This release completes phase 6 of the agreed progression roadmap without adding medical supplies, ammunition, weight or logistics micromanagement.

- Surviving squads now remain at their return base as persistent formations instead of disappearing.
- Major bases naturally recover every squad to full HP; treatment facilities accelerate healing and reorganization.
- Treatment facilities unlock at civilization Lv.1, have Tier 1–4 progression and are limited to one per major base.
- Simple bases reorganize assault, skirmisher and retrieval squads without natural healing. A simple aid station heals those light formations up to 70% HP.
- Recovery and ready squads cannot receive tactical movement orders. A ready squad of the same type redeploys without formation cost; replacing it with another type costs the new formation normally.
- If a simple base is destroyed during recovery, the squad evacuates by road to the nearest reachable major base.
- Deployment, squad details, base command and civilization panels expose recovery state, treatment source, ceiling and remaining time.
- Recovery state and progress survive save/restore and use the existing world simulation.

Full behavior and values are documented in `docs/squad-recovery-v0.27.0.md`.



## Combined-arms squads retained from v0.26.0

This section documents phase 5 of the agreed progression roadmap. It adds civilization-gated friendly squad roles without adding logistics, ammunition, weight or supply-item micromanagement.

- Civilization Lv.0 retains the general-purpose assault squad.
- Civilization Lv.1 unlocks the skirmisher squad: fast movement, priority targeting and high damage against light specialists, but weak performance against armored enemies and hostile bases.
- Civilization Lv.2 unlocks the siege squad: slow and vulnerable on the road, but highly effective against hostile bases.
- Civilization Lv.3 unlocks the heavy squad: high durability and a 24 m guard zone that absorbs 45% of damage aimed at nearby friendly squads.
- Civilization Lv.4 unlocks the expedition squad: strong general combat values and slow self-recovery after ten seconds outside combat.
- Major bases can deploy every unlocked squad. Simple field bases can deploy assault, skirmisher and retrieval squads; siege, heavy and expedition squads remain major-base only.
- Deployment previews show the selected squad, route and exact resource cost before confirmation. Locked squads remain visible with their civilization requirement.
- All squad types use the existing stop, selectable retreat, route-selected resume and withdrawal commands.
- Squad type, role-specific combat state and expedition recovery cooldown survive save/restore and remote regional simulation.
- Map glyphs, squad details and the civilization panel identify the active role and unlock level.

Full values and verification boundaries are documented in `docs/combined-arms-v0.26.0.md`.

## Survey network v0.25.0

This release completes phase 4 of the agreed progression roadmap. It adds civilization-gated survey towers that expand the visible road map from owned bases without revealing exact local discoveries remotely.

- Survey towers unlock at civilization Lv.1 and begin at Tier 1.
- One active survey tower may be assigned to each major or simple base. The player-only construction radius cannot authorize one.
- Tier 1–4 survey radii are 600, 900, 1,200 and 1,600 m; scan intervals are 180, 150, 120 and 90 seconds per road chunk.
- Requests are serialized globally and new network acquisitions begin no more often than once every 30 real seconds. Duplicate and recently failed chunk requests are suppressed.
- Remotely surveyed chunks expose roads, connectivity and unidentified frontier signals. Exact hostile-base placement, recovery items and local exploration sites require physical entry into the chunk.
- Entering a surveyed chunk promotes it to physically observed state and materializes eligible local content.
- A survey tower attached to a destroyed simple base stops until that base is rebuilt.
- Survey progress, remote/physical observation boundaries and tower scheduling state survive save and restore.

Full behavior and verification boundaries are documented in `docs/survey-network-v0.25.0.md`.

## Simple field bases v0.24.0

This section documents phase 3 retained from v0.24.0. Surveying was added in v0.25.0, squad roles in v0.26.0 and recovery facilities in v0.27.0.

- Civilization Lv.1–4 allows one to four simple bases in a separate slot pool from major bases.
- A simple base has 40 HP, creates a 50 m construction zone and can deploy assault, skirmisher and retrieval squads only.
- Placement requires fresh GPS, road access within 50 m, at least 140 m from every owned base and at least 120 m from an active hostile base.
- Major bases retain their 85 m construction zone, full deployment role and separate `civilization level + 1` limit.
- Enemies may attack a simple base when it is a meaningfully closer settlement target, but do not abandon a much nearer city to do so.
- Destruction removes construction, deployment and regional-activity benefits. The destroyed site keeps its slot and must be rebuilt in person within 50 m.
- Major-base placement cannot overwrite an active or destroyed simple-base site.
- Base command and radar views distinguish `FIELD` bases and `RUIN` sites and can move the camera to either without moving the player.
- Standing on a simple base still preserves the player's independent 85 m current-location construction zone.
- Existing saves keep all previously established secondary bases as major bases; none are silently converted.

Full behavior and verification boundaries are documented in `docs/field-bases-v0.24.0.md`.

## Defense tier progression v0.23.0

This section documents phase 2 retained from v0.23.0. Simple bases were added in v0.24.0, surveying in v0.25.0, squad roles in v0.26.0 and recovery in v0.27.0.

- Every new defense starts at Tier 0 and upgrades one tier at a time.
- The civilization level is the maximum upgrade tier: civilization Lv.1 unlocks Tier 1, through Lv.4 unlocking Tier 4.
- Every defense line now has deterministic Tier 0–4 durability and operating values.
- Upgrades consume the displayed resource bundle only after final validation.
- Upgrades preserve the current HP percentage and cannot be used as free repairs.
- Ruined defenses must be repaired before upgrading.
- The selected-defense panel shows the actual tier name, current values, next-tier changes, exact cost and lock reason.
- The civilization panel summarizes the current tier ceiling and next unlock for every defense line.
- Existing upgraded defenses are normalized to the new durability table without changing their damage percentage.
- Gate conversion starts at Tier 2, preserves damage percentage and no longer skips directly from a basic wall to the highest available gate.

Full values and behavior are documented in `docs/defense-tiers-v0.23.0.md`.


## System-wide regression audit v0.22.2

This maintenance release audits the v0.22.1 tactical-order implementation against construction, combat, road expansion, frontiers, field recovery, civilization progression, multiple player bases, persistence, offline simulation and PWA delivery. Facility-tier phase 2 remains intentionally unstarted.

- No cross-system state corruption or gameplay regression was found in the existing systems.
- Friendly-route evaluation now uses combat and friendly-support spatial indexes instead of scanning every enemy and defense for every road edge. A 6,400-node benchmark fell from roughly 0.60 seconds to roughly 0.07 seconds in the build environment.
- Route distance and ETA now include the squad's remaining distance on its current road segment.
- Tapping a displayed route line selects that route instead of accidentally adding a waypoint.
- Route confirmation still revalidates node/edge connectivity and leaves the squad unchanged when a stale or invalid route is rejected.
- Full serial, parallel, long-simulation, save/restore and mixed-system stress verification passed.

Detailed scope and findings are documented in `docs/system-audit-v0.22.2.md`.


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

Each player base can maintain one active deployed aggregate squad and one returning, recovering or ready garrison formation. The original assault squad remains available, and v0.26.0 adds civilization-gated specialist roles.

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

- Every established base displays HP, nearby enemies, nearby defenses, active/recovering/ready squads and nearby uncollected items.
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

The release archive contains the complete modular source and tests. Browser-launch results for this release are documented under `docs/browser-test-v0.28.3.md`; final GPS, Overpass and mobile-layout checks must be performed on the deployed HTTPS page.
