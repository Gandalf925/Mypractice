# Defense tier progression v0.23.0

This release completes phase 2 of the agreed progression roadmap. It does not add forward bases, surveying facilities, new squad classes, squad recovery or recovery squads.

## Rules

- Every newly constructed defense starts at Tier 0.
- A defense may be upgraded one tier at a time.
- The next tier requires a civilization level equal to that tier.
- Upgrades consume the listed resources only after final validation.
- Upgrading preserves the current HP percentage. It cannot be used as a free repair.
- Ruined defenses must be repaired before upgrading.
- Existing saves are normalized to deterministic tier durability while preserving HP percentage.
- Tier 4 is the maximum tier.

## Single-target line

| Tier | Name | HP | Range | Damage | Reload | Upgrade cost |
|---:|---|---:|---:|---:|---:|---|
| 0 | 投石台 | 150 | 78 m | 5 | 2.2 s | Initial construction |
| 1 | 強化投石台 | 180 | 85 m | 7 | 2.0 s | 加工木材5・縄2・石材12 |
| 2 | 石造投石塔 | 225 | 92 m | 10 | 1.9 s | 切石8・加工木材5・縄2 |
| 3 | 青銅投槍台 | 280 | 100 m | 17 | 1.8 s | 加工木材8・縄3・青銅塊6 |
| 4 | 鉄弩砲 | 350 | 115 m | 30 | 2.0 s | 加工木材10・縄4・鍛鉄10 |

## Area line

| Tier | Name | HP | Range | Direct | Reload | Blast | Targets | Splash |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 0 | 岩落とし台 | 150 | 90 m | 18 | 16 s | 18 m | 3 | 60% |
| 1 | 大型岩落とし台 | 185 | 100 m | 24 | 15 s | 20 m | 3 | 60% |
| 2 | 牽引式投石機 | 235 | 115 m | 34 | 14 s | 22 m | 4 | 60% |
| 3 | 青銅破砕機 | 300 | 132 m | 48 | 13 s | 25 m | 5 | 65% |
| 4 | 重投石機 | 380 | 150 m | 68 | 12 s | 28 m | 6 | 65% |

## Slow line

| Tier | Name | HP | Range | Slow | Duration | Targets | Reload |
|---:|---|---:|---:|---:|---:|---:|---:|
| 0 | 蔓縄罠 | 150 | 72 m | 25% | 6 s | 3 | 8 s |
| 1 | 杭と縄の罠 | 175 | 78 m | 30% | 7 s | 3 | 7.5 s |
| 2 | 重石罠 | 215 | 86 m | 36% | 8 s | 4 | 7 s |
| 3 | 青銅拘束具 | 260 | 94 m | 42% | 9 s | 5 | 6.5 s |
| 4 | 鉄杭罠 | 320 | 102 m | 48% | 10 s | 6 | 6 s |

## Repair line

| Tier | Name | HP | Range | Tower repair | Wall repair | Cycle |
|---:|---|---:|---:|---:|---:|---:|
| 0 | 修繕小屋 | 180 | 105 m | 5 | 6 | 3.0 s |
| 1 | 木工修繕所 | 220 | 110 m | 7 | 8 | 3.0 s |
| 2 | 石工修繕所 | 270 | 115 m | 9 | 10 | 2.8 s |
| 3 | 青銅修繕所 | 330 | 120 m | 12 | 14 | 2.7 s |
| 4 | 鉄器修繕所 | 410 | 128 m | 16 | 18 | 2.5 s |

## Wall and gate durability

| Tier | Wall | HP | Gate | HP |
|---:|---|---:|---|---:|
| 0 | 丸太柵 | 220 | — | — |
| 1 | 木柵 | 340 | — | — |
| 2 | 石壁 | 560 | 石門 | 700 |
| 3 | 青銅補強壁 | 760 | 青銅門 | 950 |
| 4 | 鉄壁 | 1050 | 鉄門 | 1300 |

Gate conversion begins at Tier 2 and preserves the wall's HP percentage. A Tier 0 or Tier 1 wall cannot skip directly to a Tier 3 or Tier 4 gate merely because the civilization is more advanced.

## UI behavior

Selecting a defense displays:

- the actual tier-specific name and operating values;
- the next tier name;
- every changed stat;
- the exact upgrade cost;
- civilization lock, resource shortage or maximum-tier status;
- a disabled upgrade button when the operation is invalid.

The civilization panel displays the current upgrade ceiling for every defense line and the next civilization unlock. Defense detail panels use bounded scrolling with sticky action controls on small screens.
