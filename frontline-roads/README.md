# FRONTLINE ROADS — modular source v0.32.10 modal display recovery

## Modal display recovery v0.32.10

- Radar quality changes no longer apply `backdrop-filter`, `filter`, clipping, or opacity rules to full-screen command panels. This prevents Android Chromium from rendering only the dark overlay while hiding the menu or civilization card.
- The mobile quality sequence now advances from power-saving to standard to high-detail instead of jumping directly from power-saving to the most expensive profile.
- Menu, civilization, base command, and deployment panels can always be closed by tapping the dark backdrop or pressing Escape. Visibility changes also keep `aria-hidden` synchronized.
- Malformed and cross-coupled legacy CSS selector lists were removed so radar rendering preferences affect radar decoration only, not interactive DOM panels.

Implementation and verification are documented in `docs/modal-display-recovery-v0.32.10.md`.

## Construction range, intercept and camera controls v0.32.9

- Civilization build ranges now use bounded level tables instead of exponential doubling. Major bases progress through 85/120/160/205/255m and field bases through 50/75/105/140/180m. Player and expedition mobile ranges remain fixed at 85m and 120m.
- Tapping an active enemy-unit marker exposes direct dispatch. The selected enemy ID becomes a moving intercept mission; the squad replans toward the enemy's next road node and automatically returns after the target is destroyed or lost.
- The normal gameplay HUD now has independent zoom controls plus instant focus buttons for the currently selected base and the player's current position.
- Range labels in base command and placement guidance read the same canonical range definitions used by gameplay. Obsolete exponential multiplier fields were removed.

Implementation and verification are documented in `docs/construction-intercept-camera-v0.32.9.md`.

## Road acquisition completeness v0.32.8

This release makes road acquisition lossless for supported road classes. It adds motorway and trunk roads, preserves disconnected major roads and separate carriageways, retains sparse roads across chunk boundaries, and refreshes road regions created by older acquisition specifications.

The initial map, player frontier expansion, and survey facilities use the same road classification and parsing pipeline. OSM source node and way identities are retained through chunk merging and compact save encoding so overlapping acquisitions do not erase or duplicate roads.

Implementation and verification are documented in `docs/road-acquisition-completeness-v0.32.8.md`.
