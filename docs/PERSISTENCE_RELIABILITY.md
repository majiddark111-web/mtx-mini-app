# Tap persistence reliability

## Changes and rationale

The former tap handler claimed a ten-minute Redis marker before saving state and queuing its audit event. A failure between those steps could mark unsaved work as processed; a replay after expiry could credit it again. Concurrent in-memory flushes could also clear a newer dirty state or write the same version twice.

Production now uses a PostgreSQL transaction for each **batch** (normally every two seconds or 50 taps), not for each individual tap:

1. Create the player's state if absent, then lock its row.
2. Check the durable receipt for this player and batch ID.
3. Calculate against the current locked state.
4. Commit state, receipt and tap audit event together.
5. Update the derived Redis leaderboard and return the authoritative state.

A failed commit rolls back all three records. A commit whose HTTP response is lost can be retried without applying the batch again. Offline income uses the same row lock and a nondecreasing server timestamp, so overlapping state requests cannot credit the same interval twice.

Production reads current state from PostgreSQL, not an instance-local cache. Purchases and social claims continue using their existing transactions/version checks. Development storage remains in-memory; its flushes are now serialized and preserve a newer dirty state.

The browser persists a batch's duration when sealing it. Retries no longer increase that duration. Old sealed batches without a stored duration use their saved first/last tap timestamps. A confirmed 422 rejection with authoritative state is removed from the queue; network/server errors and malformed responses are not acknowledged.

## Architecture tradeoff

This replaces the original Redis-first write-behind proposal for production taps. Redis still serves security/rate limits, leaderboards and legacy queue draining. Stronger batch acknowledgement now depends on a PostgreSQL transaction on each sync. There is no new per-individual-tap request.

The old Redis adapter load tests are regression coverage for legacy/development adapters, **not** capacity proof for this new path. Before production, measure batch latency, database pool waiting, lock contention and storage growth under the intended concurrent-user load.

## Migration and rollout

- Apply additive migration `004_tap_receipts.sql` before starting the new API. Existing schema/data is not removed.
- The checked-in Render Blueprint runs `node server/migrate.mjs` after a successful build. If Render overrides the build command, verify migration is still included.
- Deploy the API and frontend from the same commit. No environment value or credential change is needed.
- Close and reopen the Telegram Mini App after both deployments become Live.
- Do not expire/delete tap receipts without designing a new replay-retention protocol. Keep them in PostgreSQL backups.
- Legacy audit events and unexpired Redis markers are checked during rollout to avoid re-crediting old batches. Ambiguous failures that occurred before this release cannot be automatically reconstructed. A missing historic receipt/event and expired Redis marker cannot prove whether a batch was credited.
- Keep the additive table during application rollback. Rolling back to the old binary also restores its old persistence limitations.

## Automated verification

Local unit tests model transaction commit/rollback and row locking. They cover failure before commit, lost response after commit, recreated service instances, simultaneous copies/distinct batches, rejected-batch replay, cache freshness, concurrent offline income, flush races and fixed client durations.

The real-infrastructure runner is `pnpm test:integration`. It requires `MTX_INTEGRATION_ALLOW_WRITE=true`, `DATABASE_URL` and `REDIS_URL` for an **isolated test environment**. It applies migrations and creates UUID-scoped records, then attempts to remove only its own records. It exercises actual PostgreSQL transactions with injected pre/post-commit failures and multiple service instances. It does not kill the database or prove host crash recovery.

No live infrastructure fault test was run as part of this local change. Local verification used Node 24.19.0; Render's configured Node 22 build/test remains a required deployment check.

## Staging acceptance

1. Open the app inside Telegram, record balance/tap power and make ten slow taps. Wait for sync, close/reopen and compare with the acknowledged balance (allow separately earned offline income).
2. Keep the app open, disconnect networking briefly and make five slow taps. Reconnect, wait for sync and reopen. Taps should be applied once, not again on another reopen. Do not clear app/browser storage during this test.
3. In staging only, after all taps are acknowledged, restart the API service. Reopen the app and confirm the acknowledged balance, upgrades and inventory remain.
4. Run the isolated infrastructure runner before relying on concurrent-write/fault recovery guarantees in production.

## Remaining limits

- Receipts prevent repeated application of the same batch ID; they are not a complete anti-cheat mechanism. Client durations can still be forged with new IDs; server-time rate budgets require separate work.
- The browser outbox is localStorage, not a backup. Clearing it, exceeding browser storage, or concurrent writable tabs can lose unsynced local input. Server row locks protect requests that arrive, not input overwritten before transmission.
- Optimistic numbers can adjust when the server rejects taps or has different energy. This is not necessarily lost committed progress.
- Redis rankings/anomaly logging are outside the gameplay transaction. An unavailable derived service may cause an error after gameplay committed; a retry is safe for the balance. Monitoring/reconciliation of those derived records remains necessary.
- PostgreSQL backups, restore drills, failover durability, network fault injection and sustained capacity tests are still release gates. Successful unit tests do not establish production readiness.
