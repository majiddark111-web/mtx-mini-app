# Profile and achievement review — 2026-11-14

## Scope

- Match Profile to the accepted Home/Game navy, cyan and gold design.
- Keep all statistics server-derived. Do not fabricate zero balances, Bronze rank,
  level 1 or achievement totals while waiting for the response.
- Reuse the existing account-scoped `useRewardRequest` controller for loading,
  read-only retry, expiry, account changes and late/unmounted response protection.
- Show explicit signing-in, reopen-in-Telegram, loading, error and empty states.
- Accessible progress bars, keyboard focus, avatar fallback and bounded progress.
- English, Persian and Arabic layouts; isolate numeric progress ratios in RTL.
- No new polling, animations, dependencies or backend/payment/tap changes.

## Verification

- TypeScript frontend/backend and changed-file ESLint checks.
- Production build passed. Existing large Wallet chunk warning remains; not
  resolved or concealed by this change.
- 358 Node tests passed, zero failed. Initial restricted runs had 13 loopback
  EACCES failures; the full suite passed after local test connectivity permission.
- `scripts/test-profile-ui.mjs`: 17 isolated Chromium scenarios passed, including
  EN/FA/AR, 320–844px widths, landscape, light/dark/system preferences, long names,
  failed load then read-only retry, no achievements, demo/signing-in/error/expired
  states, late response across accounts, late response after expiry/unmount,
  loaded-state expiry and out-of-range progress bounds.
- Browser harness blocks all external requests and mocks `/api/profile`; no live
  account, payment, game state or database is changed. Screenshots use fixture data.
- Checked no horizontal overflow, last badge accessible above fixed navigation,
  settings/home destinations and active Profile navigation.
- EN 390px and FA 320px screenshots visually inspected. Full-page screenshots
  capture the fixed navigation at the initial viewport position, not at page end.

## Handoff

Local implementation only; Push, frontend Live and real Telegram acceptance are
still required. Check actual account statistics, locked/unlocked achievements,
scrolling to the final badge and Settings/Home navigation after deployment.

Backup automation remains paused and unchanged. No Render/Neon settings,
credentials or hosting plan were modified. This is not a mainnet launch approval
or a new numeric estimate of overall project completion.
