# Leaderboard and history reliability — 2026-10-30

## Findings and changes

- History now scopes reads to the authenticated account, handles expiry/unmount and ignores late responses. Retry is read-only and synchronously guarded by the existing request controller.
- Leaderboard reads now include account identity in their lifecycle. Only one HTTP refresh per active scope is in flight, errors are visible with Retry, and old account/scope results cannot replace the active board.
- A WebSocket is marked live only after a valid leaderboard message. Malformed messages are caught; silent, failed or stale streams fall back to HTTP polling. An older HTTP result cannot overwrite a newer socket message. Timers and sockets are cleaned up on exit or expiry.
- The virtual list resets when account, period or result length changes, avoiding blank space after a long list shrinks.
- History and leaderboard responses are checked before display. Duplicate IDs within a category, duplicate leaderboard users/ranks, nonfinite/negative amounts and malformed records produce a visible loading error instead of ambiguous rows. Records are not silently removed. IDs may legitimately be equal across separate history categories.
- Amount strings are formatted once rather than reparsing localized output. Only confirmed payments display positive MTX credit.

## Scope limits found during review

This is not a live database audit and does not prove that all stored purchases or rewards are unique. No live records were read or modified by the automated checks, and no payment or consumable was sent.

The existing database stores only one daily-claim row per user (primary key in migration 001). The existing reward-history query reconstructs the latest daily reward from that row and reports its UTC claim day, not the actual claim time. Other reward categories are capped by their existing queries. The page now explicitly says that it shows recent recorded activity and only the latest daily claim. A complete immutable reward ledger, historical migration and exact daily claim timestamps remain separate work; no older rewards were fabricated.

The existing server tests cover period gameplay totals (excluding purchases/rewards), UTC period rollover and combined reward-history ordering. These tests are evidence about code with fixtures, not proof of production account reconciliation.

## Verification

- 251 Node tests passed, zero failures/skips.
- Client/server TypeScript and lint of changed code passed.
- Production build passed.
- New command: `pnpm test:activity:ui`, with optional Playwright/browser environment variables documented in REWARD_ACCEPTANCE.md.
- 23 isolated browser scenarios: eight history and fifteen leaderboard checks. API traffic is intercepted and the suite rejects mutation requests. The WebSocket is a local fake, not a real authenticated socket.
- The existing 45 reward/referral/inventory UI scenarios are also run as regression checks.

Scenarios cover normal and empty lists, failed/malformed/duplicate reads, read-only retry, late account/expiry/unmount responses, history filters and confirmed-only payment credit, changing ranking periods, non-overlapping polling, polling errors, malformed/silent/stale sockets, HTTP/socket response ordering and a scrolled list shrinking.

## Phone acceptance after deployment

1. Reopen MTX and open Leaderboard. Switch Global, Friends and Weekly; confirm the selected period loads or shows its appropriate empty message, without the previous period flashing as the new result.
2. Open History. Switch Purchases, Payments and Rewards; check one already-known record per available category and confirm unpaid payments do not display positive credit.
3. Reopen the app and confirm the same recorded actions are not duplicated.

No new purchase, referral, reward reset or inventory acquisition is needed. Phone acceptance of this revision is pending.
