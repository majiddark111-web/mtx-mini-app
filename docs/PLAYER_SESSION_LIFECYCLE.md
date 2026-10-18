# Player-session renewal and recovery

## Policy

- Player access tokens still expire after 15 minutes.
- An authenticated, signed POST to `/api/session/refresh` can obtain a new token and request-signing key **before** expiration. It cannot revive an expired token.
- The original Telegram login time is signed into `sessionStartedAt`. Renewal preserves it, and token expiry is capped at eight hours after that login. Tokens from the previous version use their signed `iat` as the starting time.
- The route uses the existing ban check, request signature, nonce replay protection and per-user/IP rate limits. The caller cannot supply identity, lifetime or signing-key parameters.
- Telegram initData freshness validation is unchanged. Expired sessions require closing and reopening the Mini App from the bot to obtain fresh launch data. No password, bot token or refresh token is stored in browser storage.
- This is a bounded rolling session, not token revocation or a refresh-token database. Old access tokens remain valid until their own expiry. Someone possessing both current player credentials could renew within the eight-hour window; signature checks do not make a compromised browser safe. Admin authentication is unchanged.

## Client behavior

The client checks expiry before protected API requests, on foreground/network restoration, and every 15 seconds while visible. Within the last minute of token lifetime, simultaneous callers share one renewal request. The token and signing key are replaced atomically.

A temporary renewal error (network, timeout, 429, 5xx or an older backend without the endpoint) backs off for 15 seconds while the previous token remains valid. Renewal timeout is 15 seconds. A 401/403 renewal rejection or actual expiry clears the in-memory player credentials, sets the UI to expired, and displays a close/reopen message.

There is no automatic replay of a purchase, payment, reward claim or other failed mutation. Existing tap retries keep their original batch IDs. Late failures from an old token do not clear a newer login. A request waiting on renewal is not allowed to switch to a different account.

Pending taps remain in the existing account-scoped localStorage outbox. Expiry seals the active batch; it does not clear the queue. New taps are paused after expiry rather than appearing as earned coins that cannot sync. On a fresh Telegram launch, existing synchronization sends the queued batches and the server's durable receipts prevent duplicate application.

Browser storage is not a backup. Clearing app/site data or losing the device can still lose unsent input. Long background suspension beyond token expiry deliberately requires reopening; the eight-hour limit is not permission to renew an already expired token.

## Verification (2026-10-18)

Added automated tests for concurrent renewal, transient-error backoff, expiry after suspension, rejected/malformed renewal, late responses, identity changes, unchanged queued batches, signed refresh, replay/ban rejection, and the absolute lifetime boundary. Existing auth, game, commerce and admin regression tests remain in the suite.

The full local suite passed: **205 tests, 17 suites, zero failures/skips** (18 tests added). Type checking, lint and the isolated production build also passed. A valid legacy token without `sessionStartedAt` was tested through renewal.

The full suite, type checking and isolated production build were also verified with Node 22.23.3, matching the production runtime. No new live database/infrastructure tests or real Telegram phone session have been run for this change.

## Rollout

1. Run `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` with the supported Node 22 runtime.
2. Publish the backend first, then the frontend from the same reviewed commit. An old frontend does not renew automatically; a new frontend with an old backend still expires safely, but cannot provide continuous renewal.
3. No database migration, new environment variable, new secret, paid plan or host change is required.
4. Close/reopen the Mini App after both deployments are Live. Do not clear browser/app data.
5. Keep the app in the foreground for more than 16 minutes. Make a few slow taps before and after minute 15; allow synchronization and reopen. Confirm the acknowledged balance persists (allow separately earned offline income).
6. Briefly disconnect before expiry, add a few taps, reconnect and verify they synchronize once. Separately leave the app offline/backgrounded past token expiry: returning must show the expiry notice and stop new taps; closing/reopening should restore login and sync pending batches once.
7. Confirm shop, wallet, rewards and the separate admin login still work. Do not initiate a real-money transaction to test renewal.

These deployment/phone checks are pending. The local implementation is not evidence that the currently deployed service has changed.
