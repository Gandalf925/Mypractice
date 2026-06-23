# Gameplay stabilization v0.31.0

## Scope

This release follows the v0.30.3 repeated-play audit. It removes avoidable production tapping, protects essential resources from accidental project contribution, makes the opening pressure recoverable, adds practical mixed-unit deployment and exposes whether the acquired road network can satisfy the late-game simple-base requirement.

## Production and civilization contributions

Production buildings accept quantities of 1, 5, 10 or the current maximum. Queued input commitments are counted before accepting another order. Project-only outputs are capped to the remaining project requirement and are delivered directly to the project.

Safe contribution preserves a civilization-level reserve for construction, repairs and recovery. Full contribution remains available as an explicit separate action.

## Opening stability

For the first fifteen minutes of Civilization Lv.0, active hostile waves are capped at two and their intervals are widened by 35 percent. A city defeat at Lv.0 restores 50 HP, clears the immediate assault, delays the next enemy-base launch and uses a smaller recovery cost. Later civilizations retain their previous defeat rules.

## Coordinated deployment

Two to six attack squads can be dispatched as one formation. The system assigns each squad to a different eligible base, computes its own route and natural travel time, and delays faster arrivals at their origin. Natural movement speed is retained; squads are not slowed to the pace of the slowest unit.

## Dense-road construction consistency

Barrier candidates previously accepted any segment intersecting the construction radius but displayed the segment midpoint. On dense road networks that midpoint could lie outside the same radius, causing a listed site to fail when selected. Barrier candidates now use the nearest projected point from a valid construction anchor, so listing and final validation use the same coordinate.

Civilization Lv.1's barrier condition records that the player has successfully constructed a barrier. Later battle destruction no longer reverses that one-time milestone.

## Simple-base diagnosis

The civilization and base panels report how many additional simple bases can be placed on the currently acquired road network, whether the three-base requirement is geographically achievable and whether more roads must be acquired. This diagnosis does not spend resources or move the player.

## Deterministic replay results

The opening scenario was repeated across line, cross and dense-grid roads, eight variants per topology and three decision cadences, for 72 runs total. All 72 reached Civilization Lv.1 with zero city defeats. Median completion times were 31.4 minutes on line roads, 26.0 minutes on cross roads and 28.1 minutes on dense grids.

Mixed heavy/siege/skirmisher formations improved from 0/9 victories under independent dispatch to 8/9 victories under coordinated dispatch. A five-unit mixed formation won 9/9 with fewer squad losses than independent deployment. Formations without adequate anti-unit damage can still fail; coordination corrects arrival timing but does not remove composition requirements.

## Compatibility

The save key and schema version remain unchanged. New queue, progress and formation fields are normalized when absent from older saves.
