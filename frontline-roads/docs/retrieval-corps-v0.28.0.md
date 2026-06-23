# Retrieval corps v0.28.0

Phase 7 adds a deliberately weak road-bound squad that can recover special items from remote hostile-base ruins. It does not replace direct player collection and does not add cargo weight, supplies, ammunition or logistics micromanagement.

## Squad definition

| Field | Value |
|---|---:|
| Unlock | Civilization Lv.0 |
| Members | 3 |
| HP | 55 |
| Speed | 1.05 m/s |
| Enemy DPS | 1.2 |
| Hostile-base DPS | 0 |
| Engagement range | 12 m |
| Collection time | 8 s |
| Cost | Wood 18, Fiber 20 |
| Deployment bases | Major and established simple bases |

The formation is intentionally weaker than every combat-oriented squad. Normal enemies can intercept and destroy it, so route choice, tactical orders, nearby defenses and escorts remain meaningful.

## Mission lifecycle

1. The player selects `回収部隊` in the deployment screen.
2. Only currently available special items are shown as targets.
3. Confirmation reserves the selected item for that squad.
4. The squad physically travels to the item's road node.
5. At the destination it remains stopped for eight simulated seconds.
6. The item changes from `RESERVED` to `CARRIED` and the squad begins its physical return.
7. The artifact is credited only when the squad reaches an established base.
8. The returning squad enters the existing recovery/reorganization lifecycle and can later redeploy.

Pickup alone never increases artifact inventory. This prevents a remote squad from granting the reward before surviving the return journey.

## Recovery-item states

- `AVAILABLE`: player or retrieval squad may start recovery.
- `RESERVED`: assigned to one active squad; direct player collection and other squads are blocked.
- `CARRIED`: moving with its assigned squad and still not credited.
- `COLLECTED`: removed from the map after successful base delivery.

An active direct-player collection blocks squad deployment before resources or a ready garrison can be modified. If assigned squad data disappears unexpectedly, orphaned `RESERVED` or `CARRIED` items are made available again.

## Destruction and withdrawal

- Destruction before pickup releases the item at its original recovery point.
- Destruction while carrying drops the item at the squad's exact road position. The nearest road endpoint is retained as its routing node.
- The dropped item may later be recovered directly by the player or assigned to another retrieval squad.
- Withdrawal before pickup cancels the mission and releases the original item.
- A carried item cannot be discarded through tactical command changes because the squad is already committed to return.
- If the origin simple base is destroyed before delivery, the returning squad uses a reachable established major base instead of teleporting or deleting the item.

## Tactical orders and regional simulation

Recovery missions use the existing squad-order system:

- Stop pauses movement and collection while preserving the reservation.
- Selectable retreat can move the squad to a chosen road point, then stop.
- Resume recalculates a route to the reserved item and restarts interrupted collection from zero when movement resumes.
- Withdrawal before pickup releases the assignment and returns to base.

The same mission state runs under active, peripheral and dormant regional update intervals. A dedicated long-distance test sends a squad through all three activity bands, completes collection and confirms delivery after the return journey.

## UI and persistence

- The deployment screen displays all squad types, then changes `攻撃目標` to `回収目標` when the retrieval squad is selected.
- Recovery cards show artifact name, source hostile-base type and the requirement to return to base.
- The map uses a white eight-sided `RECV` marker.
- Squad details distinguish travel to the item, on-site collection and item transport.
- Save data preserves mission type, assigned item, item status, route, pickup progress and carried position.
- Exact GPS history remains excluded by the existing privacy sanitizer.

## Regression boundaries

This phase does not change hostile-base drops, artifact requirements, direct five-second GPS collection, defense balance, road surveying, civilization progression, facility tiers or combat-squad statistics. It adds no weight, inventory capacity, transport resources or supply routes.
