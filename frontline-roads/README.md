# FRONTLINE ROADS — modular source v0.20.0 world frontiers

FRONTLINE ROADS is a location-based, continuously progressing road-defense strategy game. This directory is the canonical modular development source.

## World frontiers v0.20.0

The battlefield is no longer limited to the road graph loaded at startup.

- The initial area still loads around the player's first position.
- As the player approaches a 600 m road-chunk boundary, the current and necessary adjacent chunks are acquired serially.
- New OSM roads are projected into the original world coordinate system and merged without replacing existing node or edge IDs.
- Duplicate requests, failed-request loops, duplicate roads and near-identical border nodes are suppressed.
- Acquired chunks are cached in IndexedDB and restored without another network request when required.
- Construction around the player's current position immediately uses newly integrated roads.

## Unknown frontiers and exploration

Dead-end roads at the observed edge become unknown frontiers rather than arbitrary map cutoffs.

- A frontier owns a fixed source position beyond the currently observed roads.
- Enemy patrol, sabotage, breach and siege groups enter from the nearest map-edge road.
- Expanding the map moves the visible entry road outward, but the source position never retreats from the player.
- Signal information progresses from `DISTANT` to `TRACE`, `LOCATED` and `CONTACT` as the player approaches.
- Reaching the source chunk creates a persistent on-site enemy-source objective.
- The player must enter the 50 m interaction range, clear source-linked enemies and complete the investigation.
- Clearing the source awards resources and permanently stops new waves from that source.

Loaded regions can also contain deterministic supply caches, survivor signals, communications sites, resource surveys and lookout points. Completed and partially investigated sites remain persistent.

## Regional simulation and performance

The expanded world uses three simulation levels based on the nearest city or player anchor.

- Active: within 900 m, updated every combat tick.
- Peripheral: within 2,400 m, advanced in two-second batches.
- Dormant: farther away, advanced in eight-second batches.

When the player approaches a remote area it immediately becomes active again. Road rendering, construction-site search and exploration-node search use a non-serialized spatial index instead of scanning the entire discovered graph.

Road graphs are stored in a compact, reversible save encoding. Draw-only geometry, repeated property names and chunk membership arrays are omitted from local-storage saves and reconstructed at load. Existing v0.19.0 object-form saves remain readable.

## Adaptive enemy behavior

Enemy routing compares movement time with estimated wall-breaking time.

- scouts, archers and carriers strongly prefer detours;
- engineers and siege units prefer breaching;
- infantry and shield units evaluate wall condition and detour length;
- specialists prioritize relevant facilities rather than always attacking the city.

Facility priorities include repair relays, slowing equipment, mortars and gun positions according to enemy type. Enemies finish their current road segment before applying a changed objective, preventing backward jumps and teleportation.

## Construction

Construction is a two-stage operation. A map tap selects a candidate; resources are consumed only after confirmation.

Valid locations are the union of:

- the 85 m radius around the home base; and
- the 85 m radius around the latest tracked player position.

The map shows valid roads/intersections, the authorizing construction zone and the facility's real effect radius. Confirmation revalidates the latest position and available resources.

## Architecture

- `src/app`: startup, lifecycle, game loop and PWA registration
- `src/core`: state schema, store, events and shared constants
- `src/location`: geolocation and coordinate conversion
- `src/roads`: road acquisition, chunks, merging, graph indexes and routing
- `src/exploration`: frontiers, source discovery and field objectives
- `src/base`: initial base placement and graph insertion
- `src/combat`: enemies, regional scheduling, waves, construction and defenses
- `src/civilization`: resources, facilities, production, progression and outposts
- `src/persistence`: compact saves, migrations, road cache, offline simulation and tab ownership
- `src/rendering`: radar, spatially culled roads, tactical overlays and effects
- `src/ui`: input, base placement, combat, civilization, menu and radar preferences
- `tests`: regression, long simulation, persistence, rendering and shell validation

## Road acquisition and privacy

Browsers query public Overpass endpoints for the initial road area and later movement-driven chunks. The request necessarily contains the center of the area whose roads are being requested. Exact movement history is not retained in the save; the saved public map origin is rounded to approximately 10 m and the live position is cleared when persisted.

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

Release result: 150 tests passed, 0 failed.

## Performance profiles

- Touch/mobile default: power-saving — 18 render Hz, 12 combat Hz, DPR 0.75
- Standard: 24 render Hz, 20 combat Hz, DPR 1
- High detail: 40 render Hz, 30 combat Hz, DPR 1.35

## Publication policy

GitHub and normal web hosting use this modular source. Do not create a single HTML during development. Generate a single HTML only immediately before blockchain publication.
