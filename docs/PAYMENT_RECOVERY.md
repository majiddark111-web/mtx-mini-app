# Recoverable TON Testnet payments

Implementation date: 2026-10-25. This change is local; no Render deployment,
live database migration, credential change, paid plan, or blockchain transfer
was performed during implementation.

## Behavior

- Migration 005 adds payment intents to PostgreSQL. It does not drop or rewrite
  existing game/payment tables. Backups must include this new table.
- The browser stores a per-account request key before contacting the API.
  Retrying that key returns the original order, including after a lost response.
- The API persists the owner, sender, recipient, amount, reward, creation time
  and sending deadline before returning a sendable order.
- The browser also saves the order before opening the wallet. Storage/API
  failure blocks wallet launch. Recovered/replayed orders are never auto-sent.
- Sending uses TON Testnet and the original sender. The wallet remains the
  user's approval surface for the actual amount and recipient.
- A pending order is not a successful payment. The user explicitly chooses
  Check payment; this action sends no TON. Network errors, missing evidence
  and sending-deadline expiry do not delete the order.
- GET /api/wallet/payments/intents requires signed authentication and returns
  only that account's unresolved orders. Local storage is also account-scoped.
- Confirmation verifies the original quote, not later environment defaults.
  The order comment, sender, recipient, amount and non-bounced message must match.
- PostgreSQL serializes confirmations using a transaction-scoped advisory lock.
  The game credit and payment record commit together. Replaying the same
  confirmed order returns its record without additional credit.
- Confirmed intents remain as an audit record. Only their client-side pending
  entry is removed. A separate purchase while orders are unresolved requires
  an explicit checkbox acknowledgement.

## Verification

Local checks used the repository's pinned Node 22 runtime:

- Frontend and backend TypeScript checks.
- Full repository Node test suite.
- ESLint, with no warnings allowed.
- Vite production build into an ignored, isolated output directory.
- New tests cover lost responses, storage failure, ownership, unauthenticated
  access, expired orders, original quotes, verifier failure, legacy recovery,
  and rejecting ambiguous HTTP 200 responses as payment confirmation.

The real PostgreSQL 18 integration test used a newly initialized localhost-only
cluster, port 55439, role mtx_payment_test, with no access to the Render database.
The runner creates and cleans a UUID-named isolated schema. It verified:

1. Migration 005 and an idempotent migration rerun.
2. Twelve simultaneous creates with one request key produce one order.
3. Pool reconnect/new persistence instance can recover an expired order.
4. Account separation and immutable original quotes.
5. Sixteen simultaneous confirmations produce one credit and one payment row.
6. Injected payment-insert failure rolls back the preceding game-state update,
   preserves the pending order, and leaves no completed payment record.

Result: PAYMENT_RECOVERY_POSTGRES_PASS and PAYMENT_RECOVERY_SCHEMA_CLEANED.
The temporary PostgreSQL server was stopped after the test. This proves tested
local transaction behavior, not real wallet/TON Center end-to-end behavior.

To rerun, provision a separate disposable local PostgreSQL instance with role
mtx_payment_test and database postgres. Set MTX_PAYMENT_TEST_DATABASE_URL to its
127.0.0.1 URL, then run:

```text
node --experimental-strip-types server/integration/paymentRecovery.mjs
```

The runner rejects non-loopback hosts and a different role/database. It must
not be repointed at production or a user's existing application database.

## Safe rollout — not executed yet

1. Take a fresh full database backup and confirm it can be restored. Avoid
   starting new test purchases while changing payment code.
2. Check the actual backend Build Command in Render. The checked-in Blueprint
   runs node server/migrate.mjs, but dashboard overrides can differ. The server
   Start Command itself does not run migrations.
3. Apply migrations with the existing migration runner before starting the new
   backend. Confirm 005_payment_intents.sql was applied. Keep the existing
   database/Redis/Treasury/Testnet settings unchanged.
4. Deploy and verify the backend before deploying the frontend. Prevent an
   automatic frontend-first rollout; the old backend lacks pending-order GET.
5. Confirm /healthz, authenticated order recovery, and previous payment history.
6. With the user authorizing a small Testnet purchase, approve in the wallet,
   close/reopen the mini-app before checking, recover the same order, then
   check it twice. Verify one payment row and exactly one balance increase.
   Also test wallet cancellation and interrupted confirmation without repaying.
7. Take a post-migration backup after successful acceptance tests.

Rollback: leave the additive table and its records intact. An old backend does
not understand new PostgreSQL-only intents. Pause new purchases and preserve/
reconcile pending orders before rolling payment code back; reverting code is
not a complete payment-state rollback.

## Boundaries and follow-up work

- The previous backend used expiring Redis intents. A confirmation can import
  one while its Redis value still exists. Already expired/deleted legacy
  intents cannot be reconstructed automatically. Keep the treasury configuration
  unchanged during this bridge: old intents did not snapshot the recipient.
- The old unscoped browser key is detected but not silently assigned to the
  current account. Preserve it for manual review; do not clear storage or repay.
- Recovery lists the newest 100 unresolved server orders and signals hasMore.
  There is no full pagination UI yet; older records remain in the database.
- TON Center lookup still checks at most 100 matching-source/destination
  messages since order creation. Very old/high-volume cases can need manual
  reconciliation or a future paginated lookup. Retained order data does not
  guarantee unlimited automatic historical blockchain discovery.
- Cancelled/unpaid orders intentionally remain unresolved. No unsafe automatic
  timeout deletion is implemented. Archival requires a separate policy.
- A lost order-creation response is recoverable by retrying with the original
  wallet. Switching wallets while that local request is unresolved is blocked.
- Independent new purchases across multiple tabs/devices are separate orders;
  request-key idempotency does not infer that two deliberate purchases are one.
- No mainnet launch, load-capacity guarantee or full production-readiness claim.
  Real-phone wallet recovery and deployed migration validation remain release gates.
