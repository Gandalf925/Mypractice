# FRONTLINE ROADS — modular source v0.33.4 road topology and route command

## Final game-balance and user-journey audit v0.33.4

- Sixteen deterministic early-, mid- and late-game scenarios produce identical gameplay outcomes in v0.33.3 and v0.33.4. Road topology and route-command changes do not alter reference enemy density, damage, resources or victory results.
- The complete opening journey was simulated from base selection through two initial defenses, first assault, recovery, repairs and civilization level 1. Two-minute and ten-minute decision delays remain survivable.
- Every civilization level 1–7 requirement has an available source, sufficient settlement slots, attainable field-base limits and an unlocked production path when it appears.
- Civilization requirements now include actionable Japanese guidance, project statuses no longer expose internal English codes, and the first post-base message explicitly directs the player to build two defenses and attack an enemy base.
- The offline help text now matches the implemented 24-hour simulation limit. Fortification evaluation now measures surviving network size and enemy suppression instead of assuming that a larger network must lose fewer facilities in absolute terms.

Implementation, results and remaining Android device checks are documented in `docs/game-balance-user-journey-v0.33.4.md` and `docs/game-balance-user-journey-v0.33.4.json`.

## Road topology and deployment route command v0.33.4

- A shared OpenStreetMap node now remains connected when bridge, tunnel or layer tags begin or end at that exact portal. Coordinate-only joins still require compatible elevation metadata.
- Road chunks repair clipped endpoint gaps and T-junctions locally when roads are acquired or restored. Existing edges are subdivided without deleting their saved identity, and grade-separated roads, parallel carriageways and unrelated nearby roads remain separate.
- Elevation and topology metadata survive compact saves and cached chunks. v0.33.3 road chunks are marked for gradual reacquisition near the player and survey facilities rather than being trusted without elevation data.
- Initial deployment can preview up to three routes, choose shortest, safer or support-weighted alternatives, and add up to two map waypoints before committing a squad. The selected route is preserved until a wall or other real obstruction makes it unusable.
- Walls attached to a road before subdivision also block every routing child created by topology repair. Existing saves remain usable and require no reset.

Implementation and regression coverage are documented in `docs/road-topology-route-command-v0.33.4.md`.

## Road expansion hot path v0.33.4

- GPS updates no longer clone the complete game state and road graph before checking map expansion. The current world point is applied through the narrow runtime update path and passed directly to the road manager.
- Road bounds are retained with runtime graph indexes, and outer road terminals are found through nearby spatial buckets instead of complete-graph scans.
- Saved chunk arrays use non-serializable runtime `Set` indexes, retaining the existing save schema while removing repeated linear membership searches.
- Network and cached road chunks merge without cloning unrelated combat, civilization, inventory and UI state. Multiple cached chunks restore in one update and rebuild graph indexes once.
- Boundary, terminal, off-network, movement-lookahead, retry and survey acquisition triggers are unchanged. Topology repair runs only when roads are acquired, restored or normalized, never on normal combat frames.

Implementation, benchmark data and regression coverage are documented in `docs/road-expansion-hotpath-v0.33.4.md` and `docs/road-expansion-hotpath-v0.33.4.json`.

## Road expansion and combat integrity v0.33.3

- Player-driven map expansion remains independent from combat connectivity analysis. Approaching an acquired-road endpoint, moving toward a chunk boundary, leaving the known road network, or continuing in a travel direction still queues current, frontier and look-ahead chunks.
- Settlement-to-road connectivity is cached by road-topology revision. Normal combat frames reuse the same reachable-node set; road merge, cache restoration or graph replacement invalidates it immediately.
- Initial preview fallback no longer starts combat with insufficient roads around a base selected near the 1km limit. The selected area is acquired and integrated before the base is established, while the normal 1.5km complete path remains unchanged.
- Frontier sources use only settlement-connected roads. The off-map source point remains fixed while future-wave entry roads can advance toward newly acquired outer terminals. Existing units keep their physical position during normal expansion; only still-waiting units at an invalid legacy entry are relocated during repair.
- Route recovery now clears stale targets and replans before any removal. Only enemies proven to remain on a settlement-disconnected fragment for 45 seconds are retired; temporarily route-less enemies on connected roads remain in play.
- Live enemies rebuild missing wave records. A population-cap failure creates no false wave, message, dispatch count or guard latch, and retries after 12 seconds rather than consuming a full interval.
- The active service worker reads only the current release cache. Early and module-level registration share one promise, so old and new modules cannot be mixed and the worker is not registered twice.
- Obsolete root demonstration assets were removed from the GitHub Pages package.

Implementation, audit and verification are documented in `docs/road-expansion-combat-integrity-v0.33.3.md`.

## Initial road startup acceleration v0.33.3

- The complete 1.5km acquisition begins immediately. If it is still pending after 1.2 seconds, a smaller 1.15km query starts on the next preferred Overpass endpoint so the central map can become interactive first.
- The central preview retains 1.05km of roads and preserves the full 1km base-placement radius. A fast complete response remains a single request.
- If the complete acquisition fails after a valid preview, selecting a base triggers a required 420m local coverage acquisition around that exact point before combat starts. Exterior roads then continue expanding through normal player movement and survey facilities.
- Endpoint rotation, phase timings, abort propagation, selection preservation and fallback-area confirmation are covered by dedicated regression tests.

Implementation and verification are documented in `docs/initial-road-startup-v0.33.3.md`.

## Enemy route and wave recovery v0.33.3

- Disconnected OSM fragments remain rendered and saved but cannot be used as enemy entry roads until physically connected to a settlement.
- Existing saves repair invalid frontier entries. Only enemies still waiting at the invalid entry move with it; units already on the road preserve their current position.
- Route recovery uses topology-aware replanning and a 45-second disconnected-fragment retirement threshold rather than deleting every temporarily route-less enemy.
- Active wave records are rebuilt from living enemies, and zero-unit launches do not consume wave counters or suppress nearby enemy bases.

Implementation and regression coverage are documented in `docs/enemy-route-recovery-v0.33.3.md`.

## Tactical build sites, walls and gates v0.33.2

- Construction no longer exposes every OpenStreetMap shape node. Intersections, terminals, major curves and sparse interval points form a cached tactical-site layer, while support facilities receive at most six representative locations per construction anchor.
- Consecutive road edges are grouped into bounded wall sections. One section accepts one wall or gate, physically duplicate road geometry is rejected, and new walls preserve the exact displayed placement point. Existing saved facilities are retained.
- Walls now block friendly road routing as well as enemy movement. Gates continue to stop enemies but remain passable to friendly squads, and trade lower durability plus higher cost for that corridor role.
- Non-blocking facilities no longer invalidate every enemy route. Build geometry is not regenerated for ordinary resource-count changes, immutable combat definitions are cached, and range-only hot paths use squared-distance comparisons.
- On the fixed 31-node dense-road benchmark, tower candidates fall from 31 to 6 and wall candidates from 30 to 2. The fixed standard civilization level 7 simulation fell from about 4.04 seconds on v0.33.1 to about 2.60 seconds in the same environment.

Implementation and verification are documented in `docs/tactical-build-performance-v0.33.2.md`.

## Tab resume and boot recovery v0.33.1

- Returning from another browser tab no longer depends on an unbounded network-first module request. Versioned application assets are served from the installed cache immediately and refreshed in the background.
- Navigation and asset network requests have explicit timeouts, so a suspended Android network request cannot leave the page permanently at `BOOT`.
- Visibility, freeze, pagehide, BFCache pageshow and discarded-tab restoration share one save/pause/resume path. Established games restore the playing HUD instead of exposing the initial-base overlay.
- A boot watchdog presents a reload action after a bounded wait without deleting the save.

Implementation and verification are documented in `docs/tab-resume-recovery-v0.33.1.md`.

## Civilization road federation v0.33.0

- Civilization progression now continues through levels 5–7: Steel Citadel, Machine City and Road Federation. Level 7 removes both major-base and field-base placement limits while construction reach remains bounded at 345m and 255m.
- Steel and mechanism resources, six settlement facilities, complete defense tiers through Tier 7, and field-barracks upgrades through Tier 7 are integrated into production, storage, progression, construction and save restoration.
- Engineer, artillery and command squads extend late-game operations. Territory expansion is unlimited at level 7, but global command capacity remains capped at 40 active squads to preserve tactical control and runtime stability.
- Enemy generations 5–7, enemy-base levels through 8, and steel, machine and command-fortress bases create denser late fronts. A carried wave clock launches at most one wave per update, preventing load or promotion backlogs from appearing simultaneously.
- Facility descriptions now use one canonical role/summary/effect/placement definition. Missing descriptions, gate/barrier wording collisions and duplicated detail paragraphs are covered by structural tests.
- A nine-scenario production combat harness validates underbuilt, standard and fortified level 5–7 defenses on a ten-front road network. Standard level 7 sustains a 525-moving-enemy peak without city defeat.

Implementation and verification are documented in `docs/civilization-road-federation-v0.33.0.md` and `docs/playtest-civilization-v0.33.0.json`.

## HUD camera placement and balance validation v0.32.12

- Gameplay zoom and focus controls now live in the HUD grid instead of floating over the tactical map. The compact row cannot cover the context panel, construction descriptions, action buttons, or the facility carousel.
- Portrait, wider and landscape layouts place the controls beside the base summary without absolute positioning, so they consume no separate map-overlay area.
- A production-system playtest harness runs seven ten-minute civilization pressure scenarios covering standard, underbuilt, and fortified defenses. It records moving enemy population, city durability, destroyed defenses, automatic repairs, wave count, and simulation cost.
- The current dense-front settings are retained: standard civilization level 4 survives a 322-enemy peak with four facility losses, while an underbuilt level 4 city is defeated. A fortified layout reduces losses to two while retaining a 296-enemy peak.

Implementation and results are documented in `docs/hud-camera-balance-v0.32.12.md` and `docs/playtest-balance-v0.32.12.json`.

## Dense-front performance v0.32.11

- Standard and power-saving rendering batch enemy markers, cache the complete combat layer between simulation changes, suppress per-unit rings in dense scenes, and limit visible enemy health bars. Static roads and radar framing remain separately cached.
- HUD refreshes reuse one detached road-graph snapshot instead of cloning the full map for every panel. Automatic survey polling no longer opens a full transactional world clone every half second when no survey work is due.
- Regional combat classification computes base/player anchors once per assignment pass, reuses the first spatial snapshot, and skips empty regional updates. Threat ranking keeps only the top eight candidates without sorting the full enemy population.
- Civilization now increases actual battlefield population, wave size, launch cadence, and departure density. Enemy caps progress through 220/320/440/580/720 from civilization level 0 through 4, while the generation grace period delays the next density tier.
- Civilization level 0 retains its existing wave size and interval so the opening balance is unchanged.

Implementation, benchmark data and verification are documented in `docs/dense-front-performance-v0.32.11.md`.

## Modal display recovery v0.32.10

- Radar quality changes no longer apply `backdrop-filter`, `filter`, clipping, or opacity rules to full-screen command panels. This prevents Android Chromium from rendering only the dark overlay while hiding the menu or civilization card.
- The mobile quality sequence now advances from power-saving to standard to high-detail instead of jumping directly from power-saving to the most expensive profile.
- Menu, civilization, base command, and deployment panels can always be closed by tapping the dark backdrop or pressing Escape. Visibility changes also keep `aria-hidden` synchronized.
- Malformed and cross-coupled legacy CSS selector lists were removed so radar rendering preferences affect radar decoration only, not interactive DOM panels.

Implementation and verification are documented in `docs/modal-display-recovery-v0.32.10.md`.

## Construction range, intercept and camera controls v0.32.9

- Civilization build ranges now use bounded level tables instead of exponential doubling. Major bases progress through 85/120/160/205/255m and field bases through 50/75/105/140/180m. Player and expedition mobile ranges remain fixed at 85m and 120m.
- Tapping an active enemy-unit marker exposes direct dispatch. The selected enemy ID becomes a moving intercept mission; the squad replans toward the enemy's next road node and automatically returns after the target is destroyed or lost.
- The normal gameplay HUD now has independent zoom controls plus instant focus buttons for the currently selected base and the player's current position.
- Range labels in base command and placement guidance read the same canonical range definitions used by gameplay. Obsolete exponential multiplier fields were removed.

Implementation and verification are documented in `docs/construction-intercept-camera-v0.32.9.md`.

## Road acquisition completeness v0.32.8

This release makes road acquisition lossless for supported road classes. It adds motorway and trunk roads, preserves disconnected major roads and separate carriageways, retains sparse roads across chunk boundaries, and refreshes road regions created by older acquisition specifications.

The initial map, player frontier expansion, and survey facilities use the same road classification and parsing pipeline. OSM source node and way identities are retained through chunk merging and compact save encoding so overlapping acquisitions do not erase or duplicate roads.

Implementation and verification are documented in `docs/road-acquisition-completeness-v0.32.8.md`.
