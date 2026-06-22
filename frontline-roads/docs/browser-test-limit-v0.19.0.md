# Browser verification limitation — v0.19.0

A headless Chromium smoke test was attempted against the local HTTP development fixture.

The Chromium process did not complete startup within the execution limit and produced no DOM output. Its diagnostics reported container-level DBus, netlink and file-watcher restrictions. The result did not expose an application JavaScript exception or an HTTP asset failure.

Verification therefore relies on the completed automated coverage:

- DOM construction and combat UI interaction tests;
- minimal Canvas rendering tests for both construction anchors;
- route, objective, combat and migration tests;
- full source syntax and module-cycle checks;
- deterministic offline and twelve-hour simulation tests;
- service-worker app-shell path verification.

After publication, confirm on a real mobile browser that both construction circles track the intended positions and that specialist enemy routes visibly terminate at their selected facilities.
