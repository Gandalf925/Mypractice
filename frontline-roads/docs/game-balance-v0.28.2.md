# Game balance verification v0.28.2

## Scope

The v0.28.1 release was replayed through deterministic simulations rather than checked only by isolated unit tests. The review covered the opening economy, defense pressure, assault squads, hostile-base destruction, artifact recovery, civilization project reachability, base expansion costs, save/offline behavior and late-stage pressure.

## Repeated playthroughs

### Balanced opening

The reference opening builds two basic attack towers, dispatches the reusable assault squad, adds one barrier after the first hostile-base destruction, recovers one artifact, repairs damaged defenses and contributes only after retaining a small emergency reserve.

| Road network | Project ready | Civilization Lv.1 complete | City defeats | Squad losses |
|---|---:|---:|---:|---:|
| One-front line | 23.2 min | 33.1 min | 0 | 0 |
| Four-front cross | 12.0 min | 22.0 min | 0 | 0 |
| Urban grid | 12.0 min | 22.0 min | 0 | 0 |

The line network remains slower because all movement uses the same corridor, but the gap no longer becomes an opening wave pile-up.

### Strategy matrix

Twenty one-hour runs were executed across ten defense layouts with and without automatic repair. The important boundary was the defense-free assault strategy:

- Before correction: one basic assault squad could remove all four initial hostile bases while largely ignoring defense.
- After correction: the same run destroyed three bases, lost two assault squads, suffered two city defeats and left one hostile base active.
- A two-tower opening with the normal barrier progression completed Lv.1 with no city defeat or squad loss.

### Extended pressure

Civilization levels 0–4 were exercised with matching defense tiers and all currently unlocked hostile-base types. Existing twelve-hour bounded/offline simulations also remain part of the full regression suite. The stress runs confirm that staying at Lv.0 or Lv.1 for several hours is intentionally unsustainable, while the processed-resource and upgraded-defense stages can stabilize the city if the player actually develops and maintains the defense line.

## Problems found and corrected

### Opening project consumed the entire economy

The former Lv.1 project required wood 180, stone 110, fiber 80, two barriers, one attack tower, another defense class and 30 kills. The required facilities plus one assault squad already exceeded the initial fiber stock before project contributions were considered.

The current requirement is:

- contribution: wood 25, stone 35, fiber 8;
- facilities: one barrier and two basic attack towers;
- progress: 20 kills, one hostile-base destruction and city HP 50+ for five minutes;
- field objective: one recovered artifact;
- construction time: ten minutes.

The project now teaches defense, assault, recovery and resource reservation in one opening loop without a multi-hour dead zone.

### City-damage progression could become permanently blocked

Civilization projects require city-HP streaks, but the city previously had no restoration path after ordinary damage. A player who fell below a threshold could become permanently unable to progress.

The city now waits 120 seconds after the last damage and reconstructs at 0.08 HP per second up to its maximum. A defeat restores the city to 35 HP, starts the same cooldown, clears the current attackers and resets active hostile-base launch clocks.

### One road front stacked every initial base

Initial placement previously selected nodes by distance alone. On linear or constrained road graphs, several bases could launch almost together into one corridor.

Placement now prefers unused angular road sectors. Bases forced into the same sector receive:

- +120 seconds to the opening delay for each earlier base on that front;
- a sustained interval multiplier of 1.0, 1.5, 2.0 and 2.5 for the first four bases on that front.

This changes front distribution rather than globally weakening enemies.

### Assault had no hostile-base counterpressure

A hostile base previously took damage without defending itself. On first direct attack it now launches one guard force using that base's own wave composition. The guard is saved with the base, cannot be duplicated by repeated update ticks and does not alter the perfect-defense streak.

### Lv.4 depended on removed content

The Lv.4 project still required three simultaneous captured outposts, although new games no longer create capturable outposts. The requirement now uses three active simple bases, matching the current expansion system.

### Expansion had no economic cost

Additional bases could be created without consuming resources. This made the civilization base limit the only constraint and invalidated processed-resource production.

Major-base costs:

| Target major base count | Cost |
|---:|---|
| 2 | timber 8, rope 4, cut stone 8 |
| 3 | timber 14, rope 6, cut stone 14 |
| 4 | timber 20, rope 8, cut stone 20, bronze 4 |
| 5 | timber 26, rope 10, cut stone 28, wrought iron 4 |

Simple-base costs:

| Simple-base slot | Cost |
|---:|---|
| 1 | timber 4, rope 2 |
| 2 | timber 6, rope 3, cut stone 4 |
| 3 | timber 8, rope 4, cut stone 6, bronze 2 |
| 4 | timber 10, rope 5, cut stone 8, wrought iron 2 |

Rebuilding a destroyed simple base costs timber 2 and rope 1.

## Regression boundaries

- Existing save schema and storage keys are unchanged.
- Old saves receive the missing city-recovery field automatically.
- Existing hostile bases without a guard flag behave as not-yet-triggered and become guarded only on their next direct attack.
- Historical outpost data remains loadable and restorable, but no current civilization project requires it.
- No direct resource bundle is granted for destroying a hostile base; the special recovery item remains at the physical destruction point.
