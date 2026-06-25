# FRONTLINE ROADS v0.28.3 UI and build-range refinement

## Changes

- Removed the top ALERT frame from normal play so it no longer overlaps the top action buttons on mobile.
- Folded long explanatory text in the bottom context panel behind a collapsed disclosure. Explanations are hidden by default.
- Added construction-anchor propagation from existing facilities. Existing defenses now extend buildable area around themselves.
- Facility-origin build radius is doubled relative to its source anchor:
  - Major base / player derived lines extend as 170m facility anchors.
  - Field-base derived lines extend as 100m facility anchors.
- Survey / medical / field-aid placement restrictions remain tied to their original base classes.
