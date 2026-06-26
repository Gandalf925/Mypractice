# Release verification — v0.33.4

## Automated verification

- Concurrent regression suite: final package verification result recorded in `docs/verification-v0.33.4.log`.
- Serial regression suite: final package verification result recorded in `docs/verification-v0.33.4-serial.log`.
- Dedicated topology and route-command coverage: passed.
- Final game-balance and user-journey audit: passed.
- JavaScript syntax verification: passed.
- Civilization level 1–4 balance harness: passed.
- Civilization level 5–7 balance harness: passed.
- Initial-road and road-expansion synthetic benchmarks: passed.
- Production import graph, HTML IDs and service-worker asset coverage: verified by the complete regression suite.
- Save key: `frontline_roads_refactor_v2`, unchanged.
- Schema version: 2, unchanged.

## Balance and user journey

- Seven early/mid-game and nine late-game deterministic scenarios were compared between v0.33.3 and v0.33.4.
- Gameplay metric changes across all sixteen scenarios: 0.
- A guided opening reaches civilization level 1 in 25m19s without a defeat or squad loss.
- A two-minute decision delay reaches level 1 in 27m09s without a defeat or squad loss.
- A ten-minute decision delay reaches level 1 in 31m29s without a defeat; one squad can be lost.
- A defense-only player does not progress and eventually suffers defeats, so the first-action message now explicitly requires an assault.
- Civilization levels 1–7 contain no unreachable building, resource-base, commander, production, field-base, defense-kind or city-HP requirement.
- Cumulative civilization construction time is 62h40m; offline simulation supports up to 24 hours per return.
- Fortified level 5–7 networks retain more surviving facilities, kill more enemies and reduce average moving pressure than standard networks.

Detailed evidence is in `docs/game-balance-user-journey-v0.33.4.md` and `docs/game-balance-user-journey-v0.33.4.json`.

## Road acquisition guarantees

- Complete initial-road acquisition radius and supported road classes: unchanged.
- Player boundary, outer-terminal, off-network, direction-lookahead and retry triggers: unchanged.
- Survey-facility acquisition: unchanged.
- Road-topology repair runs only during acquisition, restoration and normalization.
- v0.33.3 chunk state migrates to acquisition specification 4 and marks known areas for gradual refresh.
- Cache version 4 rejects old chunk payloads that lack trustworthy elevation metadata.
- Existing gameplay saves remain usable; no reset is required.

## Synthetic CPU measurements

The following are Linux/Node.js synthetic measurements, not Android GPS, GPU or live Overpass measurements.

- 2,000-node location update: 35.2526ms in v0.33.3 to approximately 0.06ms in v0.33.4.
- 5,000-node location update: 105.8817ms to approximately 0.04ms.
- 10,000-node location update: 236.2386ms to approximately 0.04ms.
- Twelve cached chunks into a 3,000-node graph remain substantially faster than v0.33.3 while including conservative topology validation.

## Remaining real-device checks

- Verify local road seams after nearby chunks have refreshed.
- Confirm a real bridge or tunnel crossing remains disconnected unless a ramp or shared OSM portal exists.
- Confirm route lines and two waypoints can be selected reliably on a narrow Android screen.
- Confirm a dispatched squad follows the selected first branch and does not revert without an actual obstruction.
- Verify GPS expansion, live Overpass failure recovery, touch ergonomics and long-session GPU performance on the target device.
