# Squad recovery and reorganization v0.27.0

This phase makes surviving friendly squads persistent assets instead of deleting them when they return to base. It intentionally adds no medical supplies, ammunition, carrying capacity, weight, logistics routes or resource-transfer micromanagement.

## Return lifecycle

A squad that completes its mission or receives a withdrawal order physically returns along the road graph. Arrival starts recovery and reorganization at the destination base. The squad remains in save data and is shown as `RECOVERING`, then `READY`.

- `RECOVERING` squads cannot receive tactical movement orders or deploy.
- `READY` squads cannot receive road orders; they redeploy from the deployment panel.
- Redeploying the same squad type preserves the squad identity and costs no formation resources.
- Choosing a different squad type disbands the ready formation and charges the full new formation cost.
- Only one active deployed squad remains allowed per base.

## Major-base recovery

Every established major base provides basic recovery without a special facility.

- Natural healing: 0.6% of maximum HP per second.
- Recovery ceiling: 100% HP.
- Base reorganization time: 45 seconds.
- Natural capacity: one squad at a time.

The civilization Lv.1 treatment line accelerates this process:

| Tier | Facility | HP recovery | Reorganization | Capacity |
|---:|---|---:|---:|---:|
| 1 | 応急治療所 | 1.2% max HP/s | 30 s | 1 |
| 2 | 石造治療所 | 1.6% max HP/s | 24 s | 1 |
| 3 | 軍医所 | 2.1% max HP/s | 18 s | 2 |
| 4 | 総合治療所 | 2.7% max HP/s | 12 s | 2 |

Each major base can contain one treatment facility. A ruined or disabled facility provides no bonus; the base immediately falls back to natural recovery.

## Simple-base recovery

A simple field base can reorganize assault and skirmisher squads but does not naturally restore HP. A ready squad may redeploy with its current HP.

The civilization Lv.1 `簡易救護所` is limited to one per simple base:

- Healing: 0.8% max HP/s.
- Recovery ceiling: 70% HP.
- Reorganization: 45 seconds.
- Capacity: one squad.
- Eligible types: assault and skirmisher only.

Legacy data that places siege, heavy or expedition squads at a field base is kept safe: those squads can reorganize but receive no field healing.

If a simple base is destroyed while a squad is recovering there, the squad automatically follows a valid road route to the nearest established major base. It does not disappear or remain permanently frozen. If no major-base route exists, it becomes stranded rather than teleporting.

## UI and persistence

- Deployment cards show recovery, readiness, free redeployment and replacement cost states.
- Squad details show destination base, recovery ceiling, treatment source and remaining reorganization time.
- Base command cards separate active, recovering and ready squad counts.
- Civilization and construction panels list treatment and field-aid unlocks and values.
- Recovery progress, treatment source, recovery target and readiness survive save/restore.
- Exact GPS position and location freshness remain excluded from saves.

## Regression boundaries

The phase does not add the recovery squad planned for phase 7. It does not change enemy-base drops, player field collection, road surveying, facility combat balance, formation roles or tactical route selection.
