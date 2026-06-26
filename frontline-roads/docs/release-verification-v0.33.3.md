# Release verification — v0.33.3

- Concurrent regression suite: 480 passed, 0 failed.
- Serial regression suite: 480 passed, 0 failed.
- Ten-minute live road-expansion/combat regression: passed.
- JavaScript syntax verification: passed.
- Civilization level 1–4 balance harness: passed.
- Civilization level 5–7 balance harness: passed.
- Production JavaScript modules: 103.
- Modules reachable from the production bootstrap: 103.
- Unreachable modules: 0.
- Unresolved imports: 0.
- Circular dependencies: 0.
- Duplicate HTML IDs: 0.
- Service-worker runtime asset omissions: 0.
- Save key: `frontline_roads_refactor_v2`, unchanged.
- Schema version: 2, unchanged.
- Complete initial road acquisition radius and road-class rules: unchanged.
- Player frontier and look-ahead acquisition remains independent from combat connectivity caching.
- Existing saves with disconnected frontier entries recover automatically; no reset is required.
- Obsolete root demonstration CSS and image assets: removed.

Synthetic 20,000-node connectivity benchmark:

- 100 uncached full traversals: 505.41ms;
- 100 cached calls: 0.034ms;
- reduction: 99.99%.

Android GPS, live Overpass latency, touch interaction and GPU rendering remain real-device verification items because they cannot be reproduced faithfully in the container.
