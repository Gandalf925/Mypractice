# Destroyed-facility removal v0.32.5

## Scope

This release replaces the repairable-wreck model with an active-facility-only model.

## Runtime behavior

- A defense tower, support facility, survey tower, barrier, or gate is removed from `state.combat.defenses` as soon as its HP reaches zero.
- A settlement production building is removed from `state.civilization.buildings` as soon as its HP reaches zero. Its production queue is removed with it.
- The released node or edge becomes available for construction immediately.
- A destroyed gate no longer participates in routing or barrier lookup. Attackers continue through the road after breaching it.
- Manual repair remains available only while a surviving facility has HP above zero and below maximum HP.

## Existing-save cleanup

Runtime normalization now performs a one-time cleanup every time a save is loaded:

1. Remove defense entries marked `ruined` or with HP at or below zero.
2. Remove settlement buildings marked `ruined`, `demolished`, or with HP at or below zero.
3. Remove production queues whose building no longer exists.
4. Collapse duplicate active defenses occupying the same node or edge. The last persisted active entry is retained.
5. Clear enemy facility targets that refer to removed entries and request route recalculation.

The save schema and save key remain unchanged.

## Removed code

- Ruined gate and ruined facility renderers.
- `FIX` and `OPEN` wreck markers.
- Wreck selection priority and selection cycling.
- Wreck occupancy messages and repair-or-remove branches.
- Restored-tower restart delay.
- Settlement `ruined`/`demolished` runtime states.
- Offline loss accounting based on wreck counts.
- Duplicate defense target invalidation logic.

Legacy `ruined` and `demolished` fields are read only during normalization or legacy migration so old saves can be cleaned safely.

## Verification focus

- Old overlapping wrecks disappear on load and the placement reopens.
- Duplicate active facilities at one placement collapse deterministically.
- Runtime tower and gate destruction removes the object immediately.
- Attackers pass through a destroyed gate and can reach the city.
- Settlement destruction removes its production queue.
- Active damaged facilities retain normal repair costs.
- UI and renderer contain no wreck-specific controls or markers.
- Normal and offline progression report losses from actual collection-size decreases.

## Verification result

- Normal test run: 394 passed, 0 failed.
- Serial test run: 394 passed, 0 failed.
- JavaScript syntax check: passed.
- Production modules: 101; all 101 are reachable from the application entry.
- Unresolved imports: 0.
- Dependency cycles: 0.
- Duplicate HTML IDs: 0.
- Service Worker source-asset omissions: 0.
- Obsolete wreck render/UI markers: 0.
- Local release assets returned HTTP 200.

Headless Chromium could not complete initialization in the container because of inotify, DBus, and NETLINK restrictions. This is recorded as an environment limitation rather than a browser-pass result.
- Re-extracted ZIP verification: 394 passed, 0 failed.
