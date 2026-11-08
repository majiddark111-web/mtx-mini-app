# Authentication and payment isolation review — 2026-11-03

## Result and boundary

Reviewed source baseline `7082904`. No authorization bypass, cross-user payment
disclosure or duplicate credit was reproduced in the local scenarios below.
This is not a complete security audit or mainnet/public-launch approval.

The owner supplied successful Neon startup/Live logs and confirmed the preceding
release's tap/reopen smoke test. This review did not independently inspect the
remote commit or deploy anything.

## New regression coverage

`server/src/paymentIsolation.node.test.ts`: 16 tests using synthetic identities,
isolated memory storage, independent replay/rate-limit state and a fake payment
verifier. No wallet transaction, blockchain request or database connection occurs.

- Sixteen simultaneous confirmations of one order produce exactly one nonduplicate
  result, one payment record and 100 MTX; another retry does not change the balance.
- A different user cannot confirm or receive the order's payment record before or
  after confirmation, and these attempts do not reach the verifier.
- The same creation key is isolated per user. Concurrent same-user creation retries
  return one stored intent. This is memory-adapter evidence, not disk durability.
- Wallet transactions, history, notifications, profile and pending-order lists
  expose the owner's order identifiers, but not to a second account.
- Missing/expired tokens, unsigned requests and mixed-account signing keys cannot
  create, list or confirm payment orders.
- Banned users cannot create, list or confirm orders.
- Forged user/reward/status fields and wrong amounts are rejected before verification.
- Identity query parameters cannot select another account's wallet/history records.
- Reused nonces are denied; newly signed retries remain idempotent.
- Verification requires both `verified: true` and `status: confirmed`; the stored
  quote, not the fake verifier's inflated reward, determines the credit.
- A simulated persistence failure before commit leaves the balance unchanged and
  order recoverable; retry credits it once. This does not simulate a real database
  failure after COMMIT or prove transactional rollback.
- A foreign legacy payment without an intent is not returned to the caller.

`server/src/authBoundary.node.test.ts`: 6 tests using only synthetic credentials.

- Valid Telegram signatures work; signatures made with another bot secret do not.
- Stale/future-dated Telegram credentials and malformed hashes are denied.
- Changing a JWT identity cannot be rescued by a request key for that identity.
- Wrong-secret and `alg: none` tokens are denied.
- Player tokens cannot read any of the eight admin data routes or invoke the three
  admin mutation routes; the admin storage remains unchanged.
- Admin tokens are not accepted as player tokens on session/profile/history/wallet.

## Source inspection

- `app.ts` resolves payment ownership from verified player credentials, checks
  persisted intent ownership and amount before chain verification, and separately
  checks ownership when returning an already-recorded payment.
- `commercePersistence.ts` scopes private reads by `user_id`; SQL values are
  parameterized. Payment commits obtain a transaction-scoped advisory lock keyed
  to the order before checking for an existing payment. Balance/version update
  and payment insertion execute through the same transaction callback.
- `jwt.ts`, `telegramAuth.ts` and `requestSecurity.ts` enforce signature checks;
  the shared API guard checks bans and signed-request replay before payment routes.
- The existing TON verifier compares sender, recipient, value and order comment.
  Existing mocked-provider tests also ran. Live chain delivery/finality, provider
  completeness/pagination and malicious-provider behavior were not verified here.

These code observations supplement, but do not replace, real persistence or
infrastructure testing.

## Verification

Node 22.23.3:

- New targeted tests: **22 passed, 0 failed**.
- Complete test suite: **351 passed, 0 failed, 24 suites**, none skipped.
- Frontend and server TypeScript checks passed.
- ESLint for both new test files passed with zero warnings.
- Diff whitespace check passed; pre-existing CRLF warnings are unrelated.

The full suite includes existing password/TOTP replay tests, bounded session
renewal, offline expiry, payment recovery and HTTP body limits. Loopback network
permission was granted for the local HTTP tests. No live service was targeted.
The server TypeScript configuration excludes test files; execution and lint are
the direct checks for the added tests. No new application build was needed because
only tests and this report changed.

## Remaining gates / next step

1. Run a separately scoped, disposable **local PostgreSQL** integration test for
   simultaneous payment commits, rollback and reconnect recovery. An existing
   runner is `server/integration/paymentRecovery.mjs`; it requires its dedicated
   local test role and must never be pointed at Neon or the live Render database.
   It was inspected but not run in this pass.
2. Test interactions between different simultaneous payments and game mutations
   using the production persistence/cache adapters. Memory success is not evidence
   of real multi-process correctness or capacity.
3. Complete chain-confirmation semantics, dependency advisory review, cache/security
   headers, trusted proxy configuration and operational monitoring before launch.

## Changes and safety

Only the two new test files and this report were added. No runtime code, migration,
environment variable, Build/Start command, user balance or live database changed.
No commit, push or deploy was performed. Existing edits to
`docs/DAILY_REWARD_ARCHIVE.md` and `docs/PROJECT_STATUS_20261030.md` were preserved.

## Follow-up: real local PostgreSQL — 2026-11-04

Ran the extended `server/integration/paymentRecovery.mjs` on a disposable
PostgreSQL 18 instance bound to loopback, after checking that the responding
server's data directory matched the test instance. Twelve concurrent create
attempts yielded one order. Sixteen confirmations of it yielded one payment
and 100 MTX. A forced insert failure rolled back the balance change. For two
distinct orders using the same balance version, only one committed initially;
the other remained pending and committed on retry with a fresh version.
Replaying either did not change the balance. After reconnect, the two synthetic
accounts held 300 and 100 MTX with three and one payment records respectively.

The runner reported `PAYMENT_RECOVERY_POSTGRES_PASS` and
`PAYMENT_RECOVERY_SCHEMA_CLEANED`; an independent query counted zero remaining
test schemas, and the temporary server stopped. This is a persistence-layer
test, not an HTTP, Redis, blockchain or production load test. No deployment.

### Signed API handler: tap during payment confirmation

On the same disposable PostgreSQL instance, a signed two-tap batch was
interleaved after the payment handler read the balance but before it committed.
The tap succeeded and the stale payment attempt returned 409 with the order
still pending. A newly signed confirmation of the same order credited 100 MTX.
Replaying both operations left 102 MTX, one payment, one tap receipt and one
tap event. The runner passed, zero test schemas remained and the server stopped.
This deterministic test uses in-process request handlers and real PostgreSQL,
not a networked HTTP client, real Redis, or a real blockchain verifier.

### Wallet retry after conflict (browser, simulated responses)

Ran `scripts/test-wallet-retry-ui.mjs` in headless Chrome against the actual
Wallet page, with a synthetic connected wallet and intercepted API responses.
The first check returned HTTP 409. The order remained in account-scoped local
storage and the new-purchase button stayed disabled. After reload (server list
deliberately empty), the saved order was still checkable. Confirmation of that
same ID removed it from the pending list and displayed one history entry.
Observed: two check requests, zero order creations, zero wallet sends.
Usability finding: the 409 status message was simply “Conflict”; it does not
tell the player to check the same order again without paying. No production
change or deployment was made. To reproduce, use the Playwright/browser paths
documented in REWARD_ACCEPTANCE.md and run the script from the repository root.

Local follow-up: the specific HTTP 409 / `Conflict` confirmation response now
displays a localized prompt to check the saved order again without repaying.
Ownership, amount and replay errors are not treated as that retry condition.
The browser test passed in Persian, English and Arabic (two checks, zero order
creations, zero wallet sends in each). Full suite: 351 passed; production
frontend build passed. Not deployed.

### Mixed local HTTP workload — 2026-11-04

Owner reported that Wallet opened and previous purchases appeared on a second
phone as well. Separately, six synthetic accounts on a loopback API and an
isolated PostgreSQL 18 schema each submitted a tap batch and read their history
concurrently for four rounds (12 requests launched per round). Three unique
two-tap batches and one replay per account gave exactly +6 coins and three
persisted receipts. Each history contained only the expected account's seeded
payment. All 48 HTTP requests succeeded. Client-side timings, from dispatch
through JSON decoding, in this run:

| Route | Requests | Median | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Tap | 24 | 126 ms | 268 ms | 578 ms |
| History | 24 | 122 ms | 295 ms | 583 ms |

The test schema was removed (zero remained), and the temporary database
stopped. No live traffic, wallet transfer or deployment. This short local run
uses real SQL but not Redis or the hosting network; it is not a capacity limit,
service-level guarantee, or sustained-load benchmark.

### Shared IP: rate limit, retained taps and retry — 2026-11-04

Six synthetic users sent signed HTTP requests to a loopback API using one
simulated forwarded IP. The application's in-memory IP limiter used the same
60 requests / 60 seconds policy as the production Redis adapter, with a
controlled window clock. After 60 successful session reads, all six submitted
two-tap batches received HTTP 429 before any balance or receipt change. A read
from a different simulated IP succeeded. Each account retained its original
sealed batch using the client outbox helpers and a memory storage substitute.
At the next window, all six retries succeeded. Replaying them before local
acknowledgment returned duplicate replies; each user finished with two coins,
one receipt for the batch and no queued taps. Zero test schemas remained and
the temporary PostgreSQL server stopped. The React timer, actual browser
storage, real VPN/proxy header trust and live Redis were not exercised.

This verifies recovery for this bounded burst, not fairness under sustained
saturation: active accounts can consume a shared IP's entire allowance.

### Sustained shared-IP simulation (2026-11-04)

`server/src/sharedIpPressure.node.test.ts` drives signed API handlers and
the real client outbox helpers in-process with in-memory storage. Six accounts,
each generating one tap every four seconds, share a 60-request/minute IP
budget with one additional session read every six seconds. The workload lasts
three simulated minutes, then stops generating both reads and new taps.
Clients are processed in fixed order and drain acknowledged batches immediately.

With a two-second retry cadence, tap refusals totaled 442 (plus 20 refused
reads). Pending taps after each minute: 36, 69, 100. At the end of minute 3
the individual queues were 14, 14, 14, 14, 17, 27. All 270 taps were credited
once (45 coins/account) and all queues emptied 60 simulated seconds after new
traffic stopped. The longest observed wait from tap arrival to acceptance was
168 simulated seconds. In the comparison run, knowing the exact IP reset time
reduced tap refusals to 20, but did not reduce the backlog or its drain time.
These are controlled times and ordering, not real-device latency or production
Redis performance. No live limits or retry policy were changed.

### Browser acceptance after Retry-After release

The owner reported that five normal taps worked on the deployed bot after
resolving a VPN connectivity issue, and the balance survived reopening.
Separately, `pnpm test:taps:retry:ui` passed in local headless Chrome using
the real GamePage, authenticated fixture, browser storage and tap-sync code.
An intercepted API on a different loopback origin returned 429 with an exposed
8-second Retry-After. The batch survived reload, a second tap was queued, and
the actual periodic flush and reconnect/visibility events made no early POST.
At the controlled deadline, the fixture committed the first retry but dropped
its reply. The original batch was resent unchanged with a fresh nonce, and
both distinct taps reconciled to 2 MTX with an empty queue. This exercises
browser behavior; server responses are simulated, not live Redis or Telegram.
Run with the Playwright and browser path settings documented in
REWARD_ACCEPTANCE.md. No production code or service configuration changed.

### Real Redis acceptance preparation (2026-11-05; execution pending)

Added `pnpm test:redis:local` to exercise the production RedisRateLimiter Lua
against a real, separately provisioned local Redis. It checks 100 concurrent
requests with exactly 7 grants, independent buckets, remaining TTL, real expiry,
repair of counters missing TTL, and rejection on Redis errors/disconnection.
The runner uses four UUID-scoped keys and deletes only those keys; it never
uses FLUSHDB/FLUSHALL or reads the application's REDIS_URL.

Execution requires both `MTX_LOCAL_REDIS_TEST_ALLOW_WRITE=true` and
`MTX_LOCAL_REDIS_TEST_URL=redis://127.0.0.1:56379/0`. Other hosts, ports,
credentials, query parameters and databases are rejected. Two automated
configuration safety tests passed. These are safety checks, NOT Redis Lua
acceptance results.

No Redis/Valkey/Docker executable or matching Windows service was found in
the accessible checks. WSL reports that it is not installed. A secondary
per-user programs directory was inaccessible. Actual Redis execution remains
pending an isolated runtime; no installation, deployment or live Redis access
was attempted. Production application code was not changed.

### Real Redis acceptance result (2026-11-06; owner-executed PASS)

Supersedes the pending execution status above. The owner installed WSL 3.0.3,
Ubuntu-24.04 on WSL2 and reported Redis 7.0.15. The dedicated Redis process
was launched on 127.0.0.1:56379 with protected mode enabled, persistence
disabled and a fresh temporary directory. NAT localhost access failed; the
owner saved `.wslconfig` with `networkingMode=mirrored` and confirmed the mode
after restarting WSL. No firewall disabling or public Redis bind was requested.

The agent's subsequent connection attempt timed out. The owner then ran the
repository's `server/integration/redisRateLimit.mjs` using the pinned Windows
Node 22 runtime from their own PowerShell and supplied this exact result:

`MTX_LOCAL_REDIS_RATE_PASS: concurrent quota, independent buckets, TTL, expiry, repair, fail-closed, cleanup`

This is owner-supplied execution evidence, not an independently observed agent
run. The PASS covers 100 concurrent requests with exactly 7 grants, independent
buckets, remaining TTL without reset on rejection, expiry, missing-TTL repair,
rejection of an invalid Redis counter and a closed client, and deletion verified
for the four UUID-scoped test keys. It is not a production capacity test, a
live Render/Valkey compatibility result, or an end-to-end Redis-backed API test.
The temporary process can be stopped with Ctrl+C in its foreground Ubuntu
window. No production code, live Redis configuration or deployed user data
was changed in this acceptance step.

### Redis-backed HTTP acceptance prepared (2026-11-07; execution pending)

Added `pnpm test:redis:http` (`server/integration/redisHttp.mjs`). It reuses
the strict opt-in and dedicated loopback URL guard. The production HTTP adapter
and API handlers use real Redis IP/player limiters and Redis replay protection,
with every Redis key scoped to a per-run UUID. The HTTP listener binds only
127.0.0.1 on an ephemeral port. Synthetic signed accounts and in-memory gameplay
avoid all live/PostgreSQL data. Rate limits use a shortened test window, not the
production thresholds or a capacity benchmark.

The scenario fills the IP allowance, expects six HTTP 429 responses with CORS
Retry-After, preserves queued batches, verifies another IP remains usable, waits
for real expiry, retries six batches, rejects a repeated signed nonce, and
retries acknowledged-but-locally-unacknowledged batches with fresh nonces.
Expected total is 12 coins with empty queues. It also expects HTTP 500 without
balance changes after closing the test Redis client. This is a closed-client
failure check, not a simulated network partition or stopped Redis server.
Only recorded UUID-scoped keys are deleted, with absence checked; no scans of
unrelated data or database-wide flushes are used.

ESLint/syntax checks passed and 22 related security/configuration tests passed.
The agent attempted the real scenario but received
`MTX_LOCAL_REDIS_HTTP_FAIL phase=redis-connect code=ECONNREFUSED`.
Thus the new HTTP/Redis acceptance is NOT yet passed; it requires an accessible
local Redis and a completed run, potentially from the owner's PowerShell as in
the preceding successful limiter acceptance. No deployment or production
application code change was made.

### Redis-backed HTTP acceptance result (2026-11-07; owner-executed PASS)

Supersedes the pending HTTP acceptance status above. The owner ran the prepared
test from Windows PowerShell against the local WSL Redis and supplied:

`MTX_LOCAL_REDIS_HTTP_PASS: 6 users, HTTP 429 + Retry-After, real expiry, nonce replay rejected, duplicate batches credited once, 12 coins total, cleanup`

This records owner-supplied execution evidence, not an agent-observed successful
run. All assertions in the scenario passed, including the final closed-client
HTTP 500 check with an unchanged balance. The six synthetic users each received
two coins, acknowledged queues emptied, and the recorded Redis keys were removed
and checked absent. The temporary HTTP listener closed at the end of the run;
the foreground Redis process may now be stopped with Ctrl+C.

The listener's `127.0.0.1:0` log prints the requested ephemeral port, not the
actual allocated port; the test sends requests to `server.address().port`.
Limits of the evidence remain: in-memory gameplay rather than PostgreSQL,
synthetic sessions rather than Telegram login, local Redis 7 rather than live
Render Valkey, and a bounded scenario rather than a capacity/load test. No
production settings, application code, or user balances changed in this step.

### Local pre-commit verification (2026-11-08)

- Pinned Node 22.23.3: all 356 tests passed (24 suites, zero failures).
  The initial restricted run failed 12 loopback HTTP tests with EACCES;
  after network permission was granted, the complete suite passed unchanged.
- Frontend and server TypeScript checks passed.
- ESLint passed for all ten JavaScript/TypeScript files in this change.
  Repository-wide ESLint is not clean: the unrelated, untracked/ignored local
  `deploy/backups/verify-20261026.mjs` reports `URL` as undefined at 10:35.
  That backup script was left untouched and is not part of this commit.
- The Chrome tap retry UI test passed again: cooldown survives reload and
  reconnect signals; a lost response is retried without double credit.
- Production Vite build passed, with the existing over-500-kB chunk warning
  (WalletPage approximately 700 kB before gzip). This is not a capacity result.
- Real Redis and PostgreSQL integration scenarios were not rerun in this
  pre-commit step. Their earlier evidence and limitations above still apply;
  in particular, the Redis success logs were supplied by the owner.

This change contains test harnesses, test commands, and this evidence report
only. No production code/configuration, user data, push, or deployment is
included. The two previously modified project-status/reward documents remain
outside the commit.
