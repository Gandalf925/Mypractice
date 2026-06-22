# FRONTLINE ROADS — radar-complete modular source v0.17.0 performance-optimized

FRONTLINE ROADS is a location-based road-defense strategy game. This directory is the canonical modular development source.

## Architecture

- `src/app`: startup, lifecycle, game loop and PWA registration
- `src/core`: state schema, store, events and shared constants
- `src/location`: geolocation and coordinate conversion
- `src/roads`: road acquisition, filtering, geometry, graph construction and routing
- `src/base`: first-base placement and graph insertion
- `src/combat`: enemies, bases, waves, defenses and combat
- `src/civilization`: resources, facilities, production, progression and outposts
- `src/persistence`: saves, migrations, offline simulation and tab ownership
- `src/rendering`: radar, roads, combat glyphs, tactical overlays and effects
- `src/ui`: input, base placement, combat, civilization, menu and radar preferences
- `tests`: regression, simulation, transport, rendering and shell validation

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

The fixture is accepted only on local/file/test origins.

## Verify

```bash
npm run verify
```

Final result: 88 tests passed, 0 failed.

## Performance profiles

- Touch/mobile default: power-saving (18 render Hz, 12 combat Hz, DPR 0.75)
- Standard: 24 render Hz, 20 combat Hz, DPR 1
- High detail: 40 render Hz, 30 combat Hz, DPR 1.35

The menu can change visual quality, motion and route overlays without changing saved game rules.

## Publication policy

GitHub and normal web hosting use this modular source. Do not create a single HTML during development. Generate a single HTML only immediately before blockchain publication.
