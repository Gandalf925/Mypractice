# FRONTLINE ROADS v0.21.0 — Expeditionary command

## Implemented phases

1. Friendly assault-squad state, road movement, enemy combat, base attack, return, remote simulation and persistence.
2. Deployment UI, non-destructive route/cost preview, active-squad status and radar rendering.
3. Removal of the obsolete nearby capture flow; enemy bases are destructible targets for friendly squads.
4. Persistent special-item drops with five-second manual 40 m field collection and fresh-position validation.
5. Cumulative artifacts in civilization requirements and a player-base limit of civilization level plus one.
6. Physical establishment of remote bases, multi-base construction/simulation anchors and a base-command map switcher.

## Core constraints

- One active assault squad per origin base.
- Enemy-base destruction does not grant the special artifact remotely.
- Recovery requires five seconds inside 40 m, a position update no older than 60 seconds and accuracy no worse than 100 m.
- A new player base requires a road intersection within 50 m and 220 m separation from existing bases.
- Map switching changes only camera coordinates.
- Save schema and save key remain unchanged for backward compatibility.

## Regression scope

Verification covers construction, combat, friendly squads, enemy-base destruction and respawn, recovery-item persistence, civilization progression, multiple bases, base-command UI, road chunks, long simulation, offline simulation, privacy sanitation, PWA assets and old compact/object road-graph saves.
