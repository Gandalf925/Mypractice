# Combined-arms squads v0.26.0

## Scope

This phase adds four specialist friendly squad classes to the existing assault-squad system. It does not add recovery facilities, field hospitals, recovery squads, ammunition, cargo, weight or supply-item management.

## Unlocks and deployment

| Civilization | Squad | Role | Allowed origins |
|---:|---|---|---|
| 0 | Assault | General purpose | Major and simple field bases |
| 1 | Skirmisher | Light-enemy interception | Major and simple field bases |
| 2 | Siege | Hostile-base destruction | Major bases only |
| 3 | Heavy | Nearby squad protection | Major bases only |
| 4 | Expedition | Long-range combined combat | Major bases only |

Every owned base retains the existing limit of one active deployed squad. The limit applies across squad types.

## Fixed definitions

| Squad | HP | Speed | Enemy DPS | Base DPS | Main special rule |
|---|---:|---:|---:|---:|---|
| Assault | 180 | 1.25 m/s | 9 | 7 | Balanced baseline |
| Skirmisher | 125 | 1.65 m/s | 8 | 2.5 | ×1.70 against light enemies; ×0.55 against armored enemies |
| Siege | 150 | 0.72 m/s | 4 | 22 | High hostile-base damage |
| Heavy | 360 | 0.70 m/s | 8 | 4.5 | Absorbs 45% of damage aimed at a friendly squad within 24 m |
| Expedition | 290 | 1.15 m/s | 14 | 12 | Recovers 1.4 HP/s after 10 s outside combat |

## Skirmisher targeting

Skirmishers prioritize discovered specialist/light enemies before ordinary distance ordering. Priority types include scouts, raiders, archers, rope cutters and ore carriers. They do not receive hidden knowledge about undiscovered enemies.

## Heavy guard

When an enemy damages a non-heavy friendly squad, an active heavy squad within 24 m receives 45% of that damage and the original target receives the remaining 55%. Guarding does not create invulnerability: both squads can be destroyed, and the heavy squad must be alive and physically nearby.

## Expedition recovery

Expedition squads recover only while not engaged, not attacking a base and not recently damaged. The delay and recovery timer are persisted. Recovery never exceeds maximum HP.

## Shared commands

All squad types use the existing tactical-order system:

- stop at the current road position;
- select a retreat destination and route;
- resume along a selected route;
- withdraw to the origin base and discard the mission.

Movement remains road-based and commands do not teleport a squad.

## UI

The deployment panel exposes all five squad cards. Locked cards show the required civilization level. Origin bases are filtered by the selected squad. Preview validation checks civilization, base kind, base status, route, per-base active-squad limit and resource cost before state changes.

The radar and selected-squad panel use distinct type labels and show the actual role values. The civilization panel lists current and future squad unlocks.

## Persistence and regional simulation

Squad type, HP, mission, tactical command, route state, combat state and expedition recovery cooldown are stored in the existing save structure. Old assault-only saves normalize to the assault definition. Active, surrounding and remote regional simulation all use the same role rules.

## Verification focus

Dedicated tests cover unlocks, origin restrictions, cost validation, skirmisher multipliers and priority, siege base damage, heavy guard interception, expedition recovery, tactical commands, save/restore and simultaneous mixed-squad remote combat.
