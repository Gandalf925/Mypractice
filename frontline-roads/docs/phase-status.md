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
| Single HTML | Deferred | Generate only immediately before blockchain publication |
| GitHub upload | Prepared | Complete modular replacement package generated for manual upload |
