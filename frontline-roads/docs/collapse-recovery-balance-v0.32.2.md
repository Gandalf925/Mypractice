# FRONTLINE ROADS v0.32.2 — Collapse and recovery balance

## Scope

This release adjusts one continuous failure-and-recovery loop rather than applying an offline-only exception:

1. Time from the first destroyed defense to broad defensive collapse.
2. Repeated losses after a city defeat.
3. Resource cost and practical time required to restore ruins.

Active play and offline progression use the same rules.

## Candidate search

Five configurations were compared on the same civilization-level-0 line, cross and grid scenarios for two hours without player input.

| Candidate | Line defeats / ruins / HP | Cross defeats / ruins / HP | Grid defeats / ruins / HP |
|---|---:|---:|---:|
| Existing v0.32.1 | 6 / 6 / 55.9 | 1 / 3 / 87.9 | 4 / 7 / 50.0 |
| Gentle | 6 / 6 / 55.0 | 0 / 3 / 55.2 | 3 / 8 / 61.7 |
| Balanced | 5 / 6 / 91.0 | 0 / 3 / 97.9 | 2 / 8 / 65.1 |
| Strong | 4 / 6 / 73.0 | 0 / 3 / 87.2 | 2 / 8 / 100.0 |
| **Selected refined configuration** | **5 / 6 / 94.6** | **0 / 3 / 90.7** | **2 / 7 / 100.0** |

The gentle configuration did not sufficiently reduce repeated losses. The balanced and strong configurations reduced defeats but allowed every defense in the representative grid to become a ruin. The selected configuration was the smallest intervention that reduced repeated defeats while retaining one surviving defense in that grid case and preserving meaningful danger on a constrained line network.

## Selected rules

### Enemy regroup after a breakthrough

When any defense is destroyed, enemy bases pause **new** wave launches for 150 seconds. Enemies already on the road continue moving and fighting. A later destroyed defense may extend the deadline, but shorter deadlines never replace a longer one.

This does not cancel a failed defense. It prevents fresh waves from immediately stacking on top of the wave that caused the breach.

### City defeat recovery

| Rule | Civilization Lv.0 | Lv.1 and later |
|---|---:|---:|
| Restored city HP | 60% | 50% |
| Enemy regroup | 210 seconds | 150 seconds |
| Requested loss | Wood 10 / Stone 6 | Wood 22 / Stone 14 |
| Protected repair reserve | Wood 50 / Stone 40 | Wood 80 / Stone 60 |

Only resources above the protected reserve are consumed. A loss therefore remains a penalty, but consecutive defeats can no longer remove the final materials needed to restart the defense network.

City natural recovery now begins after 75 seconds and restores 0.12 HP per second. The previous values were 120 seconds and 0.08 HP per second.

### Ruin restoration

Tower and support-facility repair uses 55% of the prior rebuild basis. Dedicated barrier repair tables are unchanged.

Examples at Tier 0:

| Facility | v0.32.1 full ruin repair | v0.32.2 full ruin repair |
|---|---|---|
|投石台|木材28・石材22・繊維8|木材16・石材13・繊維5|
|岩落とし台|木材50・石材60・繊維18|木材28・石材33・繊維10|
|修繕小屋|木材34・石材14・繊維18|木材19・石材8・繊維10|
|丸太柵|木材20・繊維8|変更なし|

A restored tower uses the existing disabled timer and becomes operational after 20 seconds. No additional repair queue or parallel state machine was introduced.

## Repeated level-0 simulation

Twelve passive two-hour runs were made across four variants each of line, cross and grid roads. A second set continued each state for 30 minutes with a repair action attempted every 20 seconds.

| Metric | v0.32.1 | v0.32.2 |
|---|---:|---:|
| Passive city defeats, total | 31 | **20** |
| Passive runs with at least one defeat | 7/12 | **5/12** |
| Passive median final city HP | 65.68 | **93.26** |
| Passive minimum final city HP | 0.72 | **48.96** |
| Ruins remaining after 30-minute recovery, mean | 1.25 | **0.42** |
| Minimum city HP after recovery phase | 82 | **100** |

Defeats by road structure:

| Road structure | v0.32.1 | v0.32.2 |
|---|---:|---:|
| Line, four runs | 24 | **18** |
| Cross, four runs | 1 | **0** |
| Grid, four runs | 6 | **2** |

The line network remains deliberately dangerous because all attacks share a narrow approach. It was not made self-sustaining without player intervention.

## Collapse speed

For line roads, median time from the first ruin to the fourth destroyed defense increased from approximately 11.7 minutes to 14.8 minutes. For grid cases that reached four ruins, the corresponding median span increased from approximately 53.6 minutes to 61.7 minutes.

The current wave remains lethal. The additional time comes from preventing immediate stacking of a new wave after each breakthrough.

## Repair affordability

The table shows the maximum number of the representative eight Tier-0 defenses that can be restored under fixed wood/stone/fiber budgets.

| Budget W/S/F | v0.32.1 | v0.32.2 |
|---|---:|---:|
| 50 / 40 / 40 | 2 | **3** |
| 80 / 60 / 50 | 3 | **5** |
| 100 / 80 / 60 | 4 | **6** |
| 150 / 100 / 70 | 6 | **8** |

The selected repair factor allows a player with preserved reserves to rebuild a functional core rather than repairing only one or two facilities and immediately collapsing again.

## Higher-level stress

Matched Tier-3 and Tier-4 defense packages had zero city defeats across line, cross and grid two-hour runs. Deliberately underdeveloped Tier-2 defenses at civilization Lv.3 still suffered defeats on cross and grid maps, so the new recovery rules do not remove the need to upgrade defenses.

## Verification

- Dedicated balance tests cover repair reserves, regroup extension, paused wave clocks, restoration cost, restart delay and active/offline equivalence.
- Existing active/offline equivalence tests remain enabled.
- Full and serial regression results are recorded separately in this release package.
