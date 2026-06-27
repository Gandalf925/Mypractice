# Roadside Supplies v0.33.4

## Objective
Add practical road-walking rewards before introducing online play. The system deliberately excludes story items, recovery-call items, and repair items.

## Implemented scope

### Phase 1: Roadside supply state and deterministic generation
- Added `src/exploration/roadside-supplies.js`.
- Generates nearby road-edge supplies from road edge id, daily epoch, home-base seed, and civilization level.
- Stores only collected IDs, active nearby candidates, daily counters, and consumable inventory.
- Keeps active candidates bounded to 32 entries.

### Phase 2: Resource supply collection
- Added common resource boxes for wood, stone, and fiber.
- Added civilization-gated processed, ore, metal, and mechanism boxes.
- Resource supplies auto-collect when the player is within 28m with recent and accurate location data.
- Uses existing inventory `addBundle` flow so capacity and overflow behavior remain consistent.

### Phase 3: Consumable inventory
- Added consumables:
  - Assault Call: temporary assault squad from current location.
  - Skirmisher Call: temporary skirmisher squad from current location.
  - Siege Call: temporary siege squad from current location.
  - Sweep Signal: clears normal enemies within 70m.
  - Breach Charge: destroys one enemy base within 45m through the existing enemy-base destruction flow.
- Excluded recovery-call and repair items.

### Phase 4: Current-location deployment
- Temporary squads spawn from the nearest road node to the player.
- They use existing friendly squad definitions and pathfinding.
- They do not consume normal base squad slots or resources.
- Only one temporary local-deployment squad can be active at a time.
- Temporary squads disband after returning instead of entering recovery/ready state.

### Phase 5: UI and rendering
- Added `ITEMS // 物資` button and modal inventory panel.
- Added map markers for roadside resources and tactical items.
- Added help text for roadside supplies.
- Added service-worker app-shell entries for new modules.

## Validation
- `npm run verify`: 508/508 tests passing.
- Added `tests/roadside-supplies.test.js` with coverage for:
  - state initialization and auto-collection,
  - sweep signal enemy removal,
  - breach charge using existing base destruction flow,
  - current-location temporary deployment,
  - bounded supply generation.

## Deferred items
- Heavy/command/artillery local calls.
- Wide-area legendary destructive item.
- Online/PvP world-effect item behavior.
- Device field testing on Android GPS and GitHub Pages/Bico deployment.
