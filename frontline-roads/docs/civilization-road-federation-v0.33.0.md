# FRONTLINE ROADS v0.33.0 — Civilization Road Federation

## Scope

This release extends the canonical game model from civilization level 4 to level 7. The implementation updates progression, resources, settlement production, defense tiers, friendly forces, enemy generations, enemy bases, construction reach, base durability, save restoration and UI presentation as one system.

The final civilization removes territorial base-count restrictions. It does not remove combat command or rendering limits: territory can expand indefinitely, while active operations remain bounded and controllable.

## Civilization levels

| Level | Name | Central facility | Settlement slots | Promotion grace |
|---:|---|---|---:|---:|
| 5 | 鋼鉄城塞 | 鋼鉄本丸 | 19 | 20 minutes |
| 6 | 機械都市 | 機関司令庁 | 22 | 20 minutes |
| 7 | 街道連邦 | 統合司令府 | 25 | 30 minutes |

`MAX_CIVILIZATION_LEVEL` is now the only civilization ceiling used by progression and UI code. The previous level-4 assumptions were removed from runtime paths.

## Territory and construction reach

| Level | Major-base limit | Field-base limit | Major reach | Field reach |
|---:|---:|---:|---:|---:|
| 5 | 5 | 5 | 285m | 205m |
| 6 | 6 | 6 | 315m | 230m |
| 7 | Unlimited | Unlimited | 345m | 255m |

Current-position reach remains 85m and expedition-squad reach remains 120m. Unlimited level-7 territory therefore still requires travel, forward deployment and local base construction.

Major-base maximum durability progresses to 200/235/275 at levels 5/6/7. Field-base durability progresses to 125/150/180. Promotion preserves each existing base's durability percentage instead of fully healing it.

## Economy

Two resources are added:

- `steel` / 鋼材
- `mechanism` / 機構部品

Steel is produced from wrought iron and charcoal. Mechanisms are produced from steel, timber and rope. They share the existing metal/high-material storage category rather than creating another storage system.

New settlement facilities:

- Lv.5: 鋼鉄倉庫, 製鋼炉
- Lv.6: 機械倉庫, 機構工房
- Lv.7: 連邦倉庫, 統合工廠

Civilization projects require production, military readiness, enemy-base control and special recovery items. Resource-reserve checks remain active so promotion cannot consume the stock required for immediate defense.

## Defense progression

All canonical defense lines now contain tiers 0 through 7:

- barrier
- gate
- single-target tower
- area tower
- slowing facility
- automatic repair facility
- medical facility
- field barracks
- survey facility

Tier-7 examples include 城塞防壁, 城塞大門, 精密連弩砲, 城塞砲撃台, 道路封鎖網, 中央整備所, 中央医療院, 前線司令所 and 道路網測量局.

Field barracks previously stopped at Tier 1. Tiers 2–7 now provide a continuous upgrade path and can supply up to four additional field-base command slots at Tier 7.

## Facility-description integrity

Defense presentation now derives from one canonical definition containing:

- role
- summary
- effect
- placement

The detail UI no longer appends `effect` and `placement` a second time. Identical normalized paragraphs are also deduplicated before display. Gates have their own presentation rather than inheriting barrier wording.

Automated integrity checks require every settlement facility and every defense tier to have a name and description, and verify that the same paragraph cannot be rendered twice in one detail view.

## Friendly forces

Late-game squads:

| Level | Squad | Primary role |
|---:|---|---|
| 5 | 工兵部隊 | enemy-base damage and manual nearby-facility repair |
| 6 | 砲撃部隊 | long-range splash damage against dense formations |
| 7 | 指揮部隊 | nearby friendly attack and movement aura |

Existing combat squads receive late-equipment scaling rather than becoming obsolete. Retrieval squads receive only partial durability scaling and no combat-damage scaling.

| Level | HP | Damage | Speed |
|---:|---:|---:|---:|
| 5 | +15% | +12% | unchanged |
| 6 | +28% | +25% | +3% |
| 7 | +42% | +38% | +5% |

Global active-squad capacity is 28/34/40 at levels 5/6/7. Level-7 territorial expansion is unlimited, but active strategic command is therefore finite. Existing squads are never deleted if a restored save is temporarily above capacity; only new dispatch is blocked.

## Enemy progression

Enemy-base scaling now reaches level 8. Generations 5–7 add steel, machine and command-era enemy roles, including guardians, breachers, hunters, saboteurs and commanders.

New advanced bases:

- 製鋼軍営
- 機械工廠
- 司令要塞

The enemy network is capped at ten simultaneously active base types. At later civilizations, advanced bases replace obsolete advanced camps instead of accumulating indefinitely. Required copper, tin and iron resource bases remain available.

Late density settings:

| Civilization | Population cap | Wave multiplier | Interval multiplier | Departure spacing |
|---:|---:|---:|---:|---:|
| 5 | 800 | 4.50 | 0.46 | 2.3s |
| 6 | 880 | 5.35 | 0.39 | 2.0s |
| 7 | 960 | 5.90 | 0.35 | 1.8s |

The level-5 value was reduced after production-system playtests showed that the initial proposal defeated both standard and heavily fortified networks. The final values preserve dense movement while allowing an upgraded standard network to survive.

A stale or restored `spawnClock` can launch only one wave in one update. Its remaining time is normalized instead of dumping several historical waves into one frame. Offline progression still processes elapsed time in bounded simulation steps and therefore preserves legitimate accumulated attacks.

## Deterministic combat playtest

`tools/playtest-civilization-v0330.mjs` runs nine fixed scenarios with the production `CombatSystem` on a ten-front radial road network. Each scenario advances five game minutes and records enemy population, facility losses, friendly losses, city durability, waves, kills, repairs and execution cost.

| Profile | Peak moving enemies | Average moving enemies | Defense losses | City defeats |
|---|---:|---:|---:|---:|
| Underbuilt Lv.5 | 483 | 307.6 | 0 | 0 |
| Standard Lv.5 | 324 | 230.9 | 9 | 0 |
| Fortified Lv.5 | 274 | 188.9 | 18 | 0 |
| Underbuilt Lv.6 | 564 | 384.6 | 1 | 0 |
| Standard Lv.6 | 329 | 261.1 | 2 | 0 |
| Fortified Lv.6 | 352 | 203.1 | 10 | 0 |
| Underbuilt Lv.7 | 766 | 497.5 | 2 | 0 |
| Standard Lv.7 | 525 | 361.5 | 4 | 0 |
| Fortified Lv.7 | 469 | 304.8 | 15 | 0 |

Underbuilt scenarios are evaluated as an overrun state when a large majority of the population cap is moving, the sustained average remains high and front-line squads are being destroyed, even if the 360m test roads prevent enemies from reaching the city within five minutes. Standard scenarios must survive while still losing facilities. Fortified scenarios must reduce operational pressure without removing the visible moving front.

The complete machine-readable result is stored in `docs/playtest-civilization-v0.33.0.json`.

## Save compatibility

The save key remains `frontline_roads_refactor_v2` and schema version remains 2. Missing late resources and progress counters are normalized when older saves load. Existing roads, facilities, bases, squads and civilization progress are not reset.
