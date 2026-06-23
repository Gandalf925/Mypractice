# FRONTLINE ROADS v0.22.0 — Combat Balance Foundation

This release implements phase 1 only. It does not add forward bases, surveying facilities, additional player squad classes, healing facilities or recovery squads.

## Defense values

### Single-target line

The single-target line is unchanged.

| Tier | Range | Damage | Reload |
|---:|---:|---:|---:|
| 0 | 78 m | 5 | 2.2 s |
| 1 | 85 m | 7 | 2.0 s |
| 2 | 92 m | 10 | 1.9 s |
| 3 | 100 m | 17 | 1.8 s |
| 4 | 115 m | 30 | 2.0 s |

### Area line

The primary target receives full damage. Nearby targets receive the listed splash multiplier, sorted by distance from impact. A hard target cap is applied to every shot.

| Tier | Range | Direct | Reload | Radius | Targets | Splash |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 90 m | 18 | 16 s | 18 m | 3 | 60% |
| 1 | 100 m | 24 | 15 s | 20 m | 3 | 60% |
| 2 | 115 m | 34 | 14 s | 22 m | 4 | 60% |
| 3 | 132 m | 48 | 13 s | 25 m | 5 | 65% |
| 4 | 150 m | 68 | 12 s | 28 m | 6 | 65% |

Tier-zero cost is wood 50, stone 60 and fiber 18. Initial stone stock is 100, so two area towers cannot be built immediately.

### Slow line

| Tier | Range | Slow | Duration | Reload | Targets |
|---:|---:|---:|---:|---:|---:|
| 0 | 72 m | 25% | 6 s | 8 s | 3 |
| 1 | 78 m | 30% | 7 s | 7.5 s | 3 |
| 2 | 86 m | 36% | 8 s | 7 s | 4 |
| 3 | 94 m | 42% | 9 s | 6.5 s | 5 |
| 4 | 102 m | 48% | 10 s | 6 s | 6 |

## Enemy-base levels

Natural hostile-base maturity:

| Base level | Required age |
|---:|---:|
| 1 | 0 minutes |
| 2 | 20 minutes |
| 3 | 60 minutes |
| 4 | 120 minutes |
| 5 | 240 minutes |

The actual maximum is:

```text
min(5, civilization level + 2)
```

During an active civilization grace period, the enemy cap is calculated from the previous civilization level.

Every base level adds exactly one unit relative to level 1. Sortie intervals remain unchanged at levels 1–2, then use 95%, 90% and 85% of the base interval at levels 3–5. The existing low-city-HP mercy multiplier remains active.

## Enemy-unit levels

An enemy records the source-base level when spawned. That level is never changed while the enemy remains on the map.

| Enemy level | HP | Attack | Speed |
|---:|---:|---:|---:|
| 1 | ×1.00 | ×1.00 | ×1.00 |
| 2 | ×1.15 | ×1.10 | ×1.02 |
| 3 | ×1.35 | ×1.22 | ×1.04 |
| 4 | ×1.60 | ×1.38 | ×1.07 |
| 5 | ×1.90 | ×1.58 | ×1.10 |

Attack scaling applies to city, settlement, barrier, facility and field-combat damage. Speed scaling is intentionally small so road length, range and slowing remain meaningful.

## Civilization-generation transition

New generation enemies are introduced at the following rates after civilization completion:

| Elapsed | Current generation share |
|---:|---:|
| 0–15 min | 0% |
| 15–30 min | 25% |
| 30–45 min | 50% |
| 45–60 min | 75% |
| 60+ min | 100% |

Previous-generation enemy types remain available during the transition. A civilization increase therefore does not temporarily reset enemy composition to the basic generation.

## Reference simulations

Deterministic straight-road tests use a 200 m route and tier-zero defenses at the city.

- Three infantry plus one shield, enemy level 2, area plus slow: the city is damaged but remains above 70 HP.
- Heavy, infantry and shield, enemy level 2, area plus slow: the city takes significant damage but survives above 35 HP.
- Area shots verify one full-damage target, 60% splash and a strict three-target cap.
- Slow shots verify 25% slowing for six seconds on the three nearest targets only.

These are regression boundaries, not final tuning targets for every real road shape. Live-device play on multiple road layouts is still required before phase 2.
