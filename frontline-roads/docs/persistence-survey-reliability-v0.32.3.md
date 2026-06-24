# Persistence and survey reliability v0.32.3

## Confirmed faults

1. `normalizeCombatState` treated a missing `runtime.combatInitialized` value as a new battle and called `initializeCombatState`, which emptied the defense collection even when a valid city and base already existed. This affected same-schema saves created before that runtime flag was added.
2. Construction, repair, upgrade and gate conversion did not save at the end of the user action. A refresh before the 15-second autosave could therefore remove the newly created facility.
3. Survey road acquisition had only one browser transport. If cross-origin POST was rejected, every facility using the same client failed.
4. The initial road graph did not consistently populate `roadChunks.loaded`, leaving survey expansion without a reliable known-region boundary.
5. A destroyed gate used the generic ruin marker and did not clearly communicate that the road was open.

## Implemented corrections

- Existing combat is inferred from a valid home base and city. Normalization repairs fields in place and never clears established defenses.
- Zero-HP facilities are normalized to ruins while remaining in the defense collection. Gate identity is normalized from `isGate` or the gate line.
- Successful facility actions persist immediately. Critical battle losses queue a microtask save after the current simulation step, and `pagehide` performs a final save.
- Initial and restored graphs derive chunk IDs from graph coordinates and merge those IDs into loaded/integrated chunk state.
- Overpass requests send a correct form-encoded POST and fall back to a safe GET query. No remote script execution or JSONP path was reintroduced.
- The successful transport is remembered per endpoint, avoiding repeated blocked POST requests.
- Survey failures retain a short diagnostic, enter `RETRY_WAIT`, and automatically become eligible after a 90-second cooldown. Success clears the error state.
- Gate rendering is distinct from walls. A destroyed gate is drawn as an open break and labeled `OPEN`; its detail status is `破壊済み・敵通行可`.

## Compatibility

- Save key unchanged.
- Schema version unchanged.
- Missing fields are normalized in place.
- Existing ruins and survey facilities are retained.
