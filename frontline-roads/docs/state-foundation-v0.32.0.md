# State foundation v0.32.0

## Objective

This release prepares the existing game for a larger redesign without adding a new gameplay system. The primary defect was that UI rendering and preview code could normalize live data merely by opening a panel. The repair separates reading, normalization, commands, simulation, and persistence.

## State access model

`StateStore` now exposes distinct operations:

- `snapshot()` returns a detached runtime snapshot for UI and non-live calculations.
- `read(selector)` returns a primitive or detached selected value.
- `transaction(mutator)` clones the current runtime state, buffers domain events, validates the result, and commits only after success.
- `advance(mutator)` is reserved for the trusted high-frequency simulation loop, where cloning the entire road world every tick would be prohibitive.
- `renderView()` is the renderer-only live view; gameplay and UI command code do not receive it.

The previous `select`, `mutate`, `update`, and `getState` APIs were removed. No compatibility wrappers remain.

## Transaction guarantees

A command that throws or produces invalid state leaves the committed state unchanged. Events emitted during the command are buffered and discarded with the failed command. Asynchronous transaction mutators are rejected so a draft cannot continue changing after commit. Listener failures are isolated after a successful commit and cannot make the caller believe the command rolled back.

## Read-only UI

Base command, civilization, deployment, and combat HUD rendering use detached snapshots. UI modules contain no `ensure*` normalization calls. Periodic HUD refresh creates one snapshot and shares it across the four UI systems rather than cloning the full world independently for every panel.

Project evaluation, base queries, deployment previews, recovery lookups, and build previews are read-only. Normalization is performed during new-game initialization, save migration, or explicit state commands.

## Normalization cleanup

`normalizeRuntimeState()` is the single restore entry point for runtime indexes and schema completion. Duplicate player-base, field-base, friendly-force, inventory, project, and recovery normalization calls were removed from the restore chain. New-game initialization now creates canonical arrays before normalizing them instead of normalizing objects that are immediately discarded.

## Startup and save isolation

Startup is divided into separate failure boundaries:

1. Saved-state validation and normalization.
2. Optional IndexedDB road-cache restoration.
3. Offline simulation.
4. Game UI startup.

Only invalid saved state is quarantined. A road-cache failure no longer destroys a valid save. Offline calculation failure restores the pre-calculation snapshot. UI startup failure preserves the save and enters the fatal-error screen instead of starting a new game over it.

Autosave now calls `saveDetachedState()` with the store snapshot. Sanitization consumes that detached copy, avoiding a second complete clone of the road world. Public `save()` remains non-mutating for callers that provide their own state object.

## Road acquisition and reset

Road requests carry a generation number. Reset and destruction increment the generation, empty the queue, clear pending IDs, and abort the current request. A response from an obsolete generation is ignored before cache write, merge, rendering, and notification. Complete reset cancels the road manager before deleting its cache.

The old JSONP transport was deleted. Overpass acquisition now performs one minimal POST attempt per configured endpoint, preserving timeout, endpoint fallback, caller abort, and diagnostic behavior without executing third-party script in the application origin.

## Time progression

The live loop no longer caps a slow frame to 0.25 seconds or discards simulation accumulator backlog. Per-frame catch-up remains bounded, but unprocessed elapsed time stays in the accumulator and is processed over subsequent frames. This prevents silent loss of game time while retaining protection against a single-frame simulation spiral.

## Removed code

The following confirmed-unused exports were deleted:

- `nearestPlayerBase`
- `edgePoint`
- `isEncodedRoadGraph`
- `chunksCoveredByCircle`
- `SURVEY_INITIAL_TIER`

No replacement aliases or versioned duplicate implementations were retained.

## Compatibility

- Save key: unchanged.
- Schema version: unchanged at `2`.
- Existing v0.31.3 saves: normalized through the canonical restore path.
- Gameplay balance, civilization progression, deployment capacity, recovery behavior, and offline-equivalence rules: retained.
