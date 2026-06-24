# v0.32.1 HUD and repair visibility

- Replaced the fixed-height two-row resource grid with a single-line horizontally scrollable strip. Overflow stock is displayed inline and can no longer increase the chip height beyond its container.
- Renamed the ambiguous city counter to headquarters HP and displays current/max durability.
- Destroyed defenses remain visible on the map with a red FIX marker and their canonical facility icon.
- Ruins continue to occupy their road node or edge until repaired or removed, preventing a new facility from overlapping an old ruin and being selected under the wrong name.
- The base summary displays a prominent repair count when defenses or settlement buildings require attention.
