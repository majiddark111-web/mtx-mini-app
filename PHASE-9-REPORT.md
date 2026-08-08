# Phase 9 — Performance & Polish Verification

## Performance budget

- Initial JavaScript: under 100 KiB gzip.
- Initial CSS: under 5 KiB gzip.
- Any route-specific chunk: under 25 KiB gzip.
- Interactive UI target: under 2.5 seconds on a mid-range mobile device over a production CDN.
- Cumulative Layout Shift target: below 0.1.
- Long lists must keep the rendered DOM bounded.

## Results

- Initial JavaScript: 93.43 KiB gzip (React, network, state, and app entry combined).
- Initial CSS: 3.28 KiB gzip.
- Largest route chunk: Game, 2.01 KiB gzip.
- 12 page-level lazy chunks produced.
- Browser smoke test: Home and direct Game route rendered with no console errors.
- Telegram SDK no longer blocks initial HTML parsing when the external script is slow or unavailable.
- Tests: 38 passed, 0 failed.
- Client/server TypeScript: passed.
- ESLint: passed with zero warnings.
- Production build: passed, 152 modules.

## Changes

- Lazy route loading with a stable skeleton fallback.
- Manual vendor chunk separation for long-term browser caching.
- Virtualized leaderboard with fixed-height overscan.
- Inventory renders in bounded batches of 40; off-screen cards use `content-visibility`.
- Purchase history DOM is capped to the latest 100 entries.
- Telegram integration waits briefly for the asynchronously loaded SDK without blocking app rendering.
- Existing reduced-motion support remains active.

## Deployment note

Run Lighthouse against the final HTTPS production URL from CI because CDN latency, compression headers, caching, and the Telegram WebView cannot be reproduced faithfully by a local preview. The bundle budgets above are deterministic release gates; the 2.5-second and CLS targets remain deployment gates.
