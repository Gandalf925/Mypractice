# Initial road progressive startup — v0.33.3

## Objective

Reduce the time before the initial road map becomes usable without weakening the complete acquisition rules introduced in v0.32.8.

## Startup path

The complete request remains authoritative and starts immediately:

1. request roads in a 1,500m radius;
2. retain the complete graph within 1,250m;
3. preserve all supported road classes, OSM identities, parallel carriageways and disconnected major roads.

If that request is still pending after 1.2 seconds, a preview starts on the next preferred Overpass endpoint with a 1,150m query and 1,050m retention radius. A fast complete response therefore uses one request only.

While the complete request is still running, the preview allows inspection and selection but keeps confirmation locked. If the complete graph arrives, the selected world point is re-snapped and the camera is preserved.

## Complete-request failure fallback

A valid preview remains usable when the complete request fails. In that specific state, confirmation performs a mandatory selected-area acquisition before combat begins:

- radius around the selected point: 420m;
- every intersecting chunk is awaited;
- loaded and independently confirmed-empty chunks count as complete;
- failure keeps the selection and presents a retry message;
- successful integration re-snaps the selection before base creation.

This preserves the full 1,000m selection radius without leaving a base selected at the preview edge with insufficient roads beyond it. After play begins, normal movement look-ahead and survey facilities continue expanding the map.

## Diagnostics and cancellation

Initial acquisition records network, parsing, graph and total timings. Retry, reset and teardown abort both complete and preview requests. Chunk waiters are also resolved on abort, preventing a confirmation promise from hanging.

## Deterministic benchmark

The included benchmark uses the real parser and graph builder with a synthetic 62-way payload and scaled waits. It is not a live Overpass or Android measurement.

Current result in this environment:

- previous map-visible point: 158.62ms;
- progressive map-visible point: 96.46ms;
- map-visible reduction: 39.2%;
- slow path: two requests;
- fast path: one request;
- graph: 1,922 nodes and 1,860 edges.

The production preview delay remains 1.2 seconds.

## Preserved behavior

- Save key and schema: unchanged.
- Complete acquisition radius and retention: unchanged.
- Initial selection radius: 1,000m, unchanged.
- Road classes and OSM identity retention: unchanged.
- Player-triggered and survey-triggered expansion: unchanged.
