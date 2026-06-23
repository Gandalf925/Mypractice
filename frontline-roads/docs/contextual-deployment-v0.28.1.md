# Contextual deployment UI v0.28.1

## Scope

This release changes only the deployment entry path and the amount of map area occupied by target UI. Combat simulation, squad costs, route planning, recovery reservations, persistence and save schema remain unchanged.

## Hostile-base flow

1. The player taps a live hostile-base marker on the map.
2. The lower context panel identifies that exact base and shows HP, level, current attackers and status.
3. The player presses `この敵拠点へ派兵` or `追加部隊を派兵`.
4. The deployment panel opens with the selected hostile base fixed as the attack target.
5. The player selects an unlocked combat squad and an eligible origin base.
6. Route, origin, unit and cost are revalidated before dispatch.
7. Successful dispatch closes the deployment panel and keeps the normal map simulation running.

The deployment panel no longer contains a hostile-target grid. A different target requires closing the panel and selecting that target on the map.

## Recovery-item flow

Available recovery items retain two distinct choices in the same target context:

- `現地で回収`: the existing fresh-GPS, range-limited direct collection path.
- `回収部隊を派遣`: opens the deployment panel with that recovery item fixed and offers only the retrieval squad.

An active direct collection disables remote dispatch for the same item. Existing reservation and rollback rules still validate the item before resource or ready-squad mutation.

## Layout constraints

- The upper HUD contains only base command, civilization and menu controls.
- Target context panels are limited to 27% of viewport height or 220 px, whichever is smaller.
- Target action buttons remain sticky inside the compact panel.
- On wide screens the deployment panel is aligned to the right so the selected map region remains visible.
- On narrow screens the deployment panel is limited to 68% viewport height and stays above the defense toolbar.
- Landscape layouts move compact target context to the side instead of covering the bottom map area.

## Compatibility

- Save key: unchanged.
- Schema version: unchanged.
- Existing v0.28.0 saves: compatible.
- Friendly-squad and recovery-item state: unchanged.
- PWA source set: unchanged except for updated source contents and cache version.
