# FRONTLINE ROADS v0.31.3 — command capacity, facility guidance and resource HUD

## Phase 1: civilization-scaled squad capacity

The fixed one-active-squad rule was removed. A base now owns persistent squad slots derived from the global civilization level.

| Civilization | Major base | Field base |
|---:|---:|---:|
| Lv.0 | 2 | 2 |
| Lv.1 | 3 | 2 |
| Lv.2 | 4 | 3 |
| Lv.3 | 5 | 3 |
| Lv.4 | 6 | 4 |

Active, recovering and ready squads each occupy one slot. A recovering squad no longer blocks all dispatches from the base; only its own slot is occupied. A ready squad of the same type can be redeployed for free. If every slot is occupied, a ready squad of another type may be replaced through the existing reorganization flow. Active or recovering squads are never deleted to make room.

Coordinated deployment now reserves slots instead of reserving entire bases. Several units can leave the same base in one formation when capacity permits.

## Phase 2: concise settlement-building guidance

Every settlement building has a short gameplay description. Catalog cards explain the building before construction, and production cards retain the same explanation after construction. Descriptions state the produced resource or storage effect and its principal downstream use.

## Phase 3: resource HUD layout

The default HUD no longer builds one long text sentence from a hand-picked resource subset. It renders all owned or overflowed resources, plus the three base resources, as independent chips. The dock uses two rows and horizontal scrolling, has a fixed height, and is positioned below the top actions. Portrait and low-height landscape layouts have explicit non-overlapping vertical positions.

## Compatibility

- Save key: unchanged
- Save schema: unchanged
- Existing squads: retained
- Capacity: derived at runtime from civilization level and base kind
- Existing settlement buildings: descriptions are presentation metadata only
