# FRONTLINE ROADS — modular source v0.19.0 adaptive fronts

FRONTLINE ROADS is a location-based, continuously progressing road-defense strategy game. This directory is the canonical modular development source.

## Architecture

- `src/app`: startup, lifecycle, game loop and PWA registration
- `src/core`: state schema, store, events and shared constants
- `src/location`: geolocation and coordinate conversion
- `src/roads`: road acquisition, filtering, geometry, graph construction and routing
- `src/base`: first-base placement and graph insertion
- `src/combat`: enemies, objectives, bases, waves, construction, defenses and combat
- `src/civilization`: resources, facilities, production, progression and outposts
- `src/persistence`: saves, migrations, offline simulation and tab ownership
- `src/rendering`: radar, roads, combat glyphs, tactical overlays, build guidance and effects
- `src/ui`: input, base placement, combat, civilization, menu and radar preferences
- `tests`: regression, simulation, transport, rendering and shell validation

## Adaptive fronts v0.19.0

Enemy routing now evaluates movement time and estimated barrier-breaking time instead of treating most barriers as impassable.

- scouts, archers and carriers strongly prefer detours;
- engineers and siege units prefer breaching;
- infantry and shield units compare the wall condition with the available detour;
- a weakened wall may be attacked even by an ordinary unit;
- a small deterministic per-enemy route bias prevents perfectly identical decisions near a route threshold.

Facility specialists now have explicit objectives:

- raiders prioritize repair relays, then mortar, gun and slowing facilities;
- rope cutters prioritize slowing facilities, then repair relays;
- siege captains prioritize mortar and gun facilities.

A specialist performs one multi-target road search when it needs a new objective. Destroyed targets invalidate all enemies assigned to that target. New defenses request safe rerouting after enemies complete their current road segment, preventing teleportation.

## Dual construction zones

Construction remains a two-stage operation. Valid sites are now the union of:

- the 85 m radius around the established home base; and
- the 85 m radius around the player's latest tracked position.

The map renders both zones separately. The selected candidate records whether the home base or current position authorizes construction. Confirmation revalidates the latest player position, so walking away cannot confirm a stale current-location candidate. Current-location construction is limited to the road graph already loaded around the original map area.

## Radar interface

The rectangular road map and all gameplay controls are retained. Radar grid/rings/sweep, luminous road lines, tactical glyphs, threat routes, range/cooldown/targeting overlays, combat pulses and terminal HUD are rendering/UI layers only. Canonical combat, civilization, save and road logic remain separate.

## Road acquisition

Browsers try Overpass JSONP first, then minimal POST, across current public endpoints. Queries are filtered to the road classes used by gameplay. Failure diagnostics identify endpoint and transport without exposing the user's coordinates.

## Run locally

Use an HTTP server because the project uses ES modules.

```bash
python -m http.server 8080
```

Normal mode:

```text
http://localhost:8080/
```

Fixed-road development mode without GPS or external road access:

```text
http://localhost:8080/?devFixture=1
```

The fixture is accepted only on local, file or explicit test origins.

## Verify

```bash
npm run verify
```

Final result: 124 tests passed, 0 failed.

## Performance profiles

- Touch/mobile default: power-saving (18 render Hz, 12 combat Hz, DPR 0.75)
- Standard: 24 render Hz, 20 combat Hz, DPR 1
- High detail: 40 render Hz, 30 combat Hz, DPR 1.35

Facility targeting uses one multi-target graph search per objective decision instead of one search per defense. Build-site scans remain signature-cached and are not repeated on every rendered frame.

## Publication policy

GitHub and normal web hosting use this modular source. Do not create a single HTML during development. Generate a single HTML only immediately before blockchain publication.
