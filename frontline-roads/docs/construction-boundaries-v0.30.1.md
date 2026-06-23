# Construction boundaries and defense removal v0.30.1

## Root cause

v0.28.3 registered every active road-defense facility as a construction anchor with a radius derived from its original base. This allowed repeated facility placement to propagate the construction zone indefinitely and removed the need for physical player movement.

## Corrected construction rules

Only these objects provide construction zones:

- Active major bases: 85 m
- Active simple bases: 50 m
- Current player position: 85 m

Placed barriers, towers, repair facilities, survey facilities and treatment facilities never provide construction range.

Existing facilities loaded from older saves remain operational even when outside the corrected zones. They do not propagate construction range and can be manually removed.

## Removal

Selecting a placed defense now exposes a removal action. The first press arms the destructive action and the second press confirms it. Removal returns no resources, deletes the defense from active state, clears enemy facility targets and forces enemy route recalculation. Ruined facilities can be removed as debris.

The save key and schema version remain unchanged.
