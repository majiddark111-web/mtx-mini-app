# Home startup and the wallet route — local verification, 2026-10-31

The previous production bundle's entry imported a shared helper from the manually named TON Connect chunk. Even a first visit to Home preloaded wallet code. Letting the existing lazy Wallet route own its dependencies removes that startup dependency. Nothing changes in payment processing, wallet connection code, or the database.

| Production build, same local runtime | Cold Home JavaScript (bytes, gzip) |
| --- | ---: |
| Before | 247,298 |
| After | 116,696 |

The figures sum individually compressed static JavaScript dependencies of the app entry and Home route. They exclude HTML, CSS, images and Telegram's external script, and are not measured download times or device performance. This change defers work until Wallet is requested; it does not eliminate the wallet SDK.

Run `pnpm test:startup:bundle` to build in memory and check that the actual SDK modules are absent from Home's static dependency graph and present in Wallet's. For the offline browser smoke test, run `pnpm test:startup:bundle --browser` with Playwright available (or set `PLAYWRIGHT_MODULE_PATH` and `REWARDS_BROWSER_PATH` as for the UI tests). It opens the production Home screen, navigates to Wallet, and verifies the wallet prompt and SDK requests. It does not connect a wallet or make a payment. Actual Telegram/device timings and backend capacity are separate checks.
