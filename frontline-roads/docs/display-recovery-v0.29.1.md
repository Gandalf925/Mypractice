# FRONTLINE ROADS v0.29.1 display recovery

## Root cause

The previous release loader wrote the new release marker, unregistered the current Service Worker, deleted all FRONTLINE ROADS caches, and reloaded before verifying that the new GitHub Pages assets were available. During deployment propagation this could leave the page with HTML but without CSS or JavaScript.

## Correction

- Removed the destructive cache deletion and forced reload.
- The HTML now loads the stylesheet first and starts the game only after CSS succeeds.
- CSS and JavaScript each try the current page-relative location and the canonical project `frontline-roads` location.
- Each asset receives a release query and one delayed retry.
- A dark recovery message is shown if all asset attempts fail; the page no longer falls back to unstyled HTML.
- Service Worker registration is resolved relative to the PWA module instead of the document alias.
- Cache fallback ignores query parameters so versioned asset requests remain available offline.
- Added `.nojekyll` markers and an `fr/` compatibility redirect.

Game simulation, save key, schema and v0.29.0 enemy behavior are unchanged.
