# Survey and construction-range reliability v0.32.4

## Scope

This release addresses two independent gameplay requirements:

1. A wooden survey facility must provide observable evidence of whether the external road request itself succeeded, instead of reporting every failure as one undifferentiated error.
2. Facility construction territory around owned bases must double whenever civilization level increases.

## Construction territory

The construction radius is derived from civilization level rather than stored in the save:

| Civilization | Major base | Simple base | Current position |
|---:|---:|---:|---:|
| 0 | 85m | 50m | 85m |
| 1 | 170m | 100m | 85m |
| 2 | 340m | 200m | 85m |
| 3 | 680m | 400m | 85m |
| 4 | 1360m | 800m | 85m |

The formula is `base radius × 2^civilization level`. The mobile current-position radius deliberately remains 85m so civilization growth expands controlled territory without turning the player into a long-range mobile construction anchor.

Construction candidates, validation messages, map placement overlays and placement-cache signatures all use the same derived radius. A civilization-level change therefore refreshes available sites immediately.

## Survey request reliability

- Initial road loading and later survey expansion share one Overpass client. A successful endpoint and transport are reused in memory and persisted for the next browser session.
- Survey chunks use a bounded-box query sized for one road chunk instead of the wider `around` query used for initial map acquisition.
- Each endpoint can use form-encoded POST or a non-script GET fallback. Remote JavaScript and JSONP are not used.
- Manual `今すぐ測量` bypasses the facility retry timer and starts the next eligible chunk immediately.
- The panel reports `COMM`, `LINK`, `RESPONSE` and integrated `ROADS` separately.
- A successful HTTP/JSON response followed by parser or graph-integration failure is reported as `通信成功・道路処理失敗`, not as a communication failure.
- A request that never receives a valid response is reported as `通信失敗` with endpoint/transport diagnostics retained by the request error.

## Verification boundary

The automated tests execute POST/GET switching, endpoint rotation, preference restoration, bounding-box generation, manual retry, response telemetry, processing-failure classification and graph integration with deterministic network fixtures.

The build environment does not provide outbound DNS/network access, so an actual public Overpass request could not be completed here. The in-game panel is therefore the definitive field diagnostic: `COMM 成功` plus a concrete `LINK` proves that the user's browser received a valid Overpass JSON response; `ROADS` proves that parsing and integration also completed.

## Compatibility

- Save key unchanged.
- Schema version unchanged.
- New survey diagnostic fields are optional and normalized on load.
- Construction ranges are derived; no save migration is required.
