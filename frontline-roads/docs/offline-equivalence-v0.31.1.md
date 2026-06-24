# Offline simulation equivalence v0.31.1

## Scope

This release corrects the difference between live 20 Hz play and offline progression. The save key and schema version remain unchanged.

## Canonical offline step

Offline progression no longer stretches a simulation update to as much as 3.6–5 seconds in order to stay below 12,000 iterations. It now uses a maximum 0.25-second step and permits up to 200,000 iterations, enough to cover the complete 12-hour offline cap.

This remains five times coarser than balanced live play at 20 Hz, so the underlying systems were also made elapsed-time preserving rather than relying only on more iterations.

## Elapsed-time preservation

- Defense reloads retain overrun time and can perform every action that became due during an update.
- Disabled facilities apply only the operational part of an update after their disabled timer expires.
- Enemy and friendly departure delays consume only their remaining wait and use the rest of the update for movement.
- Enemy and friendly units carry unused movement across every road edge reached during the same update.
- Enemy slow expiration is split inside an update, so movement before and after expiration uses the correct speed.
- Barrier attacks preserve their half-second cadence and continue after a barrier is destroyed when time remains.
- The 30-second enemy-base reconciliation clock preserves its remainder instead of resetting it to zero.
- Regional active, peripheral and dormant simulation uses a maximum 0.25-second combat substep.

## Verification

Dedicated tests compare:

- tower reload at 20 Hz against one coarse update;
- enemy departure delay and movement across multiple short road edges;
- a deterministic 60-second CombatSystem interval at live 0.05-second and offline 0.25-second steps.

A long-duration benchmark repeats the same defense interval at 30 minutes, 1 hour, 4 hours and 12 hours. Enemy HP, tower cooldown, kills, city HP and canonical world time are identical at every checkpoint. The complete benchmark is recorded in `offline-equivalence-benchmark-v0.31.1.json`.

The existing 12-hour connected-road simulation completes the full 43,200 seconds without exceeding the enemy cap or save-size limit.

## Compatibility

No save-key or schema-version change is required. Existing cooldowns, delays, movement progress and regional accumulators are normalized by the existing state restoration path and continue from their stored values.
