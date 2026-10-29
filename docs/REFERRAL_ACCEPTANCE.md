# Referral UI reliability — 2026-10-29

## Change scope

The referral page now reuses the account-scoped reward request controller for status loading and referral acceptance. A synchronous lock prevents same-frame duplicate submissions. Loading, mutation and unknown-result states disable submission. Errors offer a read-only status refresh, never an automatic POST replay. Status and feedback from a previous account, expired session or unmounted page cannot update the active page.

Clipboard writes have their own synchronous lock, success/error feedback and lifecycle guard. The test suite mocks clipboard writes: it does not alter the operator's clipboard. The outgoing invite remains the existing Telegram `startapp` link format. Manual codes are trimmed before submission. English, Persian and Arabic messages are provided.

No referral amounts, backend acceptance rules, device fingerprint algorithm, schema, environment variables or production records were changed. In particular, a user-agent/screen-size fingerprint remains only an abuse heuristic, not proof of a unique device.

## Automated evidence

`pnpm test:rewards:ui` now executes the existing 19 reward checks and 12 referral checks. Use the optional Playwright/browser setup described in [reward acceptance](REWARD_ACCEPTANCE.md). The referral scenarios cover:

- Same-frame double click: one POST, trimmed code and expected hash format.
- Network failure and accepted-but-lost response: visible error and GET-only recovery.
- Successful POST followed by refresh failure: distinguish acceptance from failure to refresh.
- Initial load failure and recovery.
- Expired session: hide old referral data and disable copy/apply.
- Late response after expiry, account change or unmount: no stale success or data.
- Clipboard success, denied permission and completion after expiry: no unhandled page error or stale success.

All 12 passed locally alongside the 19 existing scenarios, with intercepted APIs and synthetic users. Client/server TypeScript, lint on the changed source/test files, all 246 existing Node tests (zero failures/skips), and the Vite production build also passed on Node 22.23.3. Final markers:

```text
MTX_REFERRAL_UI_PASS 12 isolated scenarios
MTX_REWARD_UI_PASS 19 isolated scenarios; no live API requests
```

## Phone acceptance update — 2026-10-30

The user reported successful link copying, opening the invite with a second account, correct inviter/invitee credit and persistence without duplicate credit after reopening. These are user-reported phone results, not independently inspected database evidence. The automated checks did not create or modify these accounts.

## Original phone acceptance checklist

After deployment, reopen the Mini App and open Invite friends. Check that the current code/statistics load, copying the link displays success, and the copied link names the intended bot with the current referral code. Do not publish or send it to anyone merely for verification.

This local check does not prove clipboard permission behavior in every Telegram WebView, nor server-side referral accounting under concurrency. No real referral was submitted by the automated tests. Do not manufacture accounts or reset existing referrals to repeat the acceptance test.
