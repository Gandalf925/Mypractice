# Compact facility panel v0.30.3

## Problem

The facility context panel rendered live statistics, an expandable description, the complete next-tier comparison and all actions at the same time. Large facility definitions therefore occupied roughly half of a portrait phone viewport and obscured the tactical map.

## Resolution

Facility inspection now has three exclusive states:

1. **Summary** — current HP, state, tier and combat metrics with Description, Repair, Upgrade and Remove actions.
2. **Details** — descriptive and placement text replaces the metric grid.
3. **Upgrade** — next-tier differences, cost and lock reason replace the normal facility information. A separate confirmation is required before resources are spent.

The selected state survives live HUD rerenders. Selecting another object resets to Summary. Tapping the same facility again or empty map space closes the context panel.

## Layout boundaries

- Portrait summary: maximum 30vh / 250px.
- Details and upgrade: maximum 34vh / 300px.
- Actions remain outside the scrollable content region.
- Landscape uses a right-side panel to preserve the central road view.

Save data and simulation rules are unchanged.
