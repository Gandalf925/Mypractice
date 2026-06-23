# FRONTLINE ROADS v0.28.4 UI/cache correction

## Corrected behavior

- The top ALERT frame and all production DOM/JavaScript/CSS references to it were removed.
- All context-panel explanatory prose, including the lead summary, is placed inside a closed `details` element.
- The default bottom panel now shows only the title, compact metrics and available actions.
- Existing facility construction anchors from v0.28.3 remain active at twice their inherited source range.
- A one-time release loader unregisters the prior app-scoped Service Worker, deletes old FRONTLINE ROADS caches, reloads, and then starts v0.28.4.
- The replacement Service Worker is registered with `updateViaCache: none`.

## Compatibility

- Save key: unchanged.
- Save schema: unchanged at version 2.
- Existing saves remain loadable.
