# Browser test status v0.28.4

The release includes a one-time browser asset refresh because the reported deployed screen still showed the v0.28.1 footer and UI. On first launch after replacing the GitHub Pages files, the loader removes the prior app Service Worker/cache and reloads once. The footer must then display `0.28.4-ui-cache-correction`.

Automated DOM/source checks confirm that the ALERT frame no longer exists and context explanations are closed by default. Final touch interaction on the deployed HTTPS page remains an external-device check.
