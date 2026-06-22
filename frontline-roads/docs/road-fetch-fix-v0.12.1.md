# v0.12.1 Road data acquisition fix

## Reproduced symptom

After clearing the previous save and starting a new game, location acquisition succeeded but the app entered `ERROR` after 30 seconds with no road graph.

## Root causes

1. Two of the three configured public Overpass endpoints were obsolete or no longer current public global instances.
2. The client downloaded every `highway` way in the radius, although the game uses only nine road classes. Dense urban areas therefore produced unnecessarily large queries.
3. The request used a GET URL with the full query string.
4. Each endpoint had only 12 seconds and the whole fallback chain ended after 30 seconds.
5. Tests covered caller cancellation but not current endpoints, request method, query scope, or fallback success.

## Changes

- Current endpoints: overpass-api.de, overpass.private.coffee, maps.mail.ru.
- Server-side highway-class filtering.
- POST form request.
- 15 seconds per endpoint, 45 seconds total.
- Clearer retry message and endpoint progress.
- Five new road-client regression tests.
- Application and service-worker version advanced to v0.12.1.

## Verification

`npm run verify`: 58 passed, 0 failed.

A real mobile request still requires deployment because the current execution sandbox cannot access arbitrary external networks.
