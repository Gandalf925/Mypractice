# Refactor and radar completion status

| Phase | Status | Main verification |
|---|---|---|
| 0 Legacy audit | Complete | Duplicate road pipelines, startup conflicts, overrides and input ownership documented |
| 1 Foundation | Complete | ES modules, explicit dependencies, syntax checks, no circular dependencies |
| 2 State/lifecycle | Complete | Canonical state schema, explicit transitions, one game loop |
| 3 Roads | Complete | One acquisition path, filtering, parallel collapse, intersection handling, routing |
| 4 Initial base placement | Complete | Direct road selection within 1 km, node insertion, no second road request |
| 5 Rendering/input | Complete | One Canvas input owner, separated camera/road/combat rendering |
| 6 Combat | Complete | Enemies, bases, waves, barriers, defenses, rerouting and city damage |
| 7 Save migration | Complete | JSON saves, index reconstruction, legacy migrations and malformed-save quarantine |
| 8 Offline progress | Complete | Canonical combat/civilization simulation, deterministic and capped at 12 hours |
| 9 Civilization | Complete | Resources, facilities, production, progression, outposts and respawn |
| 10 Full UI | Complete | Base placement, combat HUD, context, civilization, production and menu |
| 11 Stability/PWA | Complete | Enemy cap, multi-tab ownership, privacy, service worker safety and app shell |
| 12 Radar foundation | Complete | Grid, rings, sweep, luminous roads and vector tactical glyphs |
| 13 Tactical awareness | Complete | Threat analysis, routes, range/cooldown/targeting overlays |
| 14 Combat feedback | Complete | Shot, impact, kill, wave, city and defense transient effects |
| 15 Terminal polish | Complete | Structured HUD and independent visual preferences |
| 16 Radar final audit | Complete | Portrait/landscape flows, no runtime errors or HUD overlaps |
| 17 Performance optimization | Complete | 88 tests, static layer caching, fixed update rates, spatial indexing and mobile stress validation |
| 18 Build planning UX | Complete | Non-destructive candidate preview, valid-site/range overlays, facility effects and capture awareness |
| 19 Adaptive fronts | Complete | Enemy-specific barrier decisions, facility-targeting specialists, dual home/player build zones |
| 20 World frontiers | Complete | Dynamic road chunks, unknown frontiers, fixed exploration sources, regional simulation and compact saves |
| 21 Expeditionary command | Complete | Friendly expedition forces, enemy-base combat, field loot, civilization-gated multiple bases and remote base map switching |
| 21.1 Readable UI | Complete | Larger HUD, panel, button and canvas labels with responsive spacing preserved |
| 22 Combat balance phase 1 | Complete | Limited splash and slowing, enemy-base levels, fixed enemy unit levels, progressive wave composition and reference simulations |
| 22.1 Tactical squad orders | Complete | Stop, selectable retreat/withdraw destinations and routes, route-selected resume, two waypoints, persistence and remote simulation |
| 22.2 System-wide audit | Complete | Cross-system regression audit, route-planning spatial indexes, accurate mid-edge ETA and route-line selection |
| 23 Defense tiers | Complete | Civilization-gated Tier 0–4 upgrades, deterministic durability, exact previews and damage-percentage preservation |
| 24 Simple field bases | Complete | Separate civilization-gated slots, 40 HP, 50 m build zones, limited deployment, enemy attacks, destruction and onsite rebuild |
| 25 Survey network | Complete | Base-anchored road expansion, serialized API acquisition, remote-information boundaries and physical discovery promotion |
| 26 Combined arms squads | Complete | Civilization-gated assault, skirmisher, siege, heavy and expedition roles, base restrictions, specialist targeting, guard interception and remote persistence |
| 27 Squad recovery | Complete | Persistent returning formations, major-base recovery, treatment facilities, simple-base aid and free same-type redeployment |
| 28 Retrieval corps | Complete | Weak road-bound remote recovery, item reservation, eight-second pickup, return-only award, death drops and regional persistence |
| 28.1 Contextual deployment UI | Complete | Global deploy button removed, map-selected target locking, compact target panel and preserved recovery dispatch |
| 28.2 Balance stabilization | Complete | Repeated strategy playthroughs, reachable civilization projects, passive city reconstruction, front-aware hostile-base pressure, guarded assaults and paid base expansion |
| Single HTML | Deferred | Generate only immediately before blockchain publication |
| GitHub upload | Prepared | Complete modular replacement package generated for manual upload |

## v0.29.0 Enemy personalities

- Added unified enemy personalities, bounded flanking routes, deterministic wave doctrines and nine civilization-linked enemy variants.
- Added simple-base raiding, friendly-squad hunting, support speed auras and expanded enemy-selection diagnostics.
- Save schema remains unchanged.
## v0.29.1 Display recovery

- Removed destructive pre-boot cache deletion and forced reload.
- Added stylesheet-first startup, versioned module retry, canonical path fallback, `.nojekyll` markers and `/fr/` compatibility redirect.
- All v0.29.0 gameplay systems and save compatibility remain unchanged.

