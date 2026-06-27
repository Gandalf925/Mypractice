# FRONTLINE ROADS v0.33.4 Solo Balance Audit before Roadside Supplies

Purpose: stabilize the current solo balance before adding Roadside Supplies.

## Iteration 1: Baseline

Commands run:

- `npm run verify`
- `npm run playtest:balance`
- `npm run playtest:civilization`
- `npm run playtest:user-journey`

Findings:

- All 503 regression tests passed.
- Early/mid balance scenarios passed.
- Opening profiles passed, including guided opening, two-minute hesitation and ten-minute hesitation.
- Late-game profiles passed, but civ5-7 generated very high simultaneous enemy counts.
- Late-game pressure leaned too much on entity density, which is risky before adding more roadside entities and future online/shared-world logic.

## Iteration 2: Density reduction attempt

Change attempted:

- Reduced civ5-7 population caps and wave multipliers aggressively.

Result:

- Entity count improved.
- Some standard late-game scenarios became too safe and no longer produced sufficient repair/destruction pressure.

Decision:

- Aggressive reduction was rejected.

## Iteration 3: Moderate density tuning + higher late enemy punch

Final change:

- Civ5-7 population caps reduced moderately.
- Civ5-7 wave multipliers reduced moderately.
- Departure spacing slightly increased.
- Enemy attack multipliers for levels 6-8 increased so fewer enemies still create meaningful pressure.
- Late-game playtest expectations were updated to count repair pressure as valid pressure, not only destroyed facilities. This better matches the current repair-button design where damage can be meaningful even when facilities survive.

Final test results:

- `npm run playtest:civilization`: passed.
- `npm run playtest:balance`: passed.
- `npm run playtest:user-journey`: passed.
- `npm run verify`: 503 passed, 0 failed.

## Result

The game is now better prepared for Roadside Supplies:

- Early and mid-game deterministic outcomes remain stable.
- Late-game enemy counts are lower, reducing mobile/online risk.
- Late-game pressure is preserved through repair pressure, friendly losses, and moving-front density.
- The design is safer before adding road items, temporary local deployment items and rare area-destruction items.
