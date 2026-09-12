# Bounded staging persistence load check

## Scope

`pnpm test:load:isolated` exercises the current **PostgresGameplayPersistence** tap path using real PostgreSQL and Redis connections. Two service objects share a two-connection PostgreSQL pool. It runs locally within the Render build process, not through the public API or Telegram.

This is a short, closed-loop load smoke test, not a capacity certificate. It excludes HTTP/TLS, authentication, global API rate limiting, Redis leaderboard updates, browser rendering, real multi-process/network deployment, payments and shop activity. It does not establish the original Redis-first write-behind DoD: gameplay currently commits one SQL transaction per batch. See [persistence tradeoffs](PERSISTENCE_RELIABILITY.md#architecture-tradeoff).

## Fixed workload and provisional acceptance budgets

- Three sequential stages: **1, 5, 10** fresh virtual users (16 total).
- Five rounds per stage, 15 taps per batch, nominal two-second spacing. No missed-round catch-up or unbounded request queue.
- Each user's last batch is submitted twice concurrently, alternating the two service objects.
- At most **20 in-flight operations**, **96 submissions**, **80 unique batches**, and **1,200 credited taps** in a successful run.
- Each user must finish with exactly 75 accepted taps, the corresponding initial tap income/XP, five receipts, five audit events and five state version increments. No flags, lost credit or double credit are accepted.
- Provisional per-stage persistence latency budget: **p95 <= 1,500 ms**, **maximum <= 5,000 ms**, checked after each round. Any failed operation or verification fails the command. A failed stage never advances to higher concurrency.
- About 24 seconds of scheduled pacing plus operation/verification/setup time. Stop scheduling new rounds after 90 seconds. This is not a hard cancellation deadline for an already submitted operation.

There are no environment knobs to raise the workload. A larger or sustained run requires a dedicated environment and a reviewed workload first. Low sample counts and closed-loop pacing limit interpretation; `completedCallsPerSecond` is observed throughput for this workload, not maximum server capacity.

## Isolation and cleanup

The entry point imports only the existing isolated provider; it ignores `MTX_INFRASTRUCTURE_MODULE` and does not accept an API URL. All migration/game tables are inside its random schema, with no public fallback; all Redis keys are prefixed for this run. No game account, wallet, bot token, balance, or player table is targeted.

**Data isolation is not hardware isolation.** PostgreSQL/Redis CPU, connections and disk are shared with staging. Run once at a quiet time, not repeatedly or concurrently. The test uses the provider's existing two-connection cap, per-statement/lock timeouts and ownership-checked cleanup. It still cannot guarantee zero performance impact on staging.

On success or failure, wait for submitted work, clean only the generated schema/exact Redis keys, and verify absence. Only then can the success marker be printed. Do not treat an earlier successful stage as proof of cleanup. SIGKILL, host termination or connection loss can prevent cleanup; in that case preserve the logged scope and inspect **only** those temporary targets. PostgreSQL schemas do not expire. Full details: [cleanup guarantees and limits](PERSISTENCE_RELIABILITY.md#light-test-on-shared-staging-infrastructure).

## One-off Render execution

1. Push the commit containing this script to the branch deployed by **mtx-api-staging**.
2. Preserve the current backend Build Command and append ` && pnpm test:load:isolated`. Keep its installation, build and migration commands. Do not add this to the frontend or Start Command.
3. Deploy once. The existing backend `DATABASE_URL` (or `POSTGRES_URL`) and `REDIS_URL` are used; no secret needs to be copied into chat or Git.
4. Save the `MTX_LOAD_STAGE` lines and check for both final markers plus successful exit:

```text
MTX_ISOLATED_CLEANUP_OK schema removed; test Redis keys verified absent
MTX_ISOLATED_LOAD_PASS_AND_CLEAN
```

5. Restore the previous Build Command by removing only the temporary suffix, so later deployments do not repeat the load.

If `MTX_ISOLATED_LOAD_FAILED` appears, save the stage/cleanup lines and investigate before retrying. A latency-budget failure is a real failed smoke check but does not by itself diagnose the cause; cold infrastructure, network latency, pool waits or shared resource contention may contribute. Do not increase the budget simply to get a pass.

## Reading the output

Each `MTX_LOAD_STAGE` JSON line includes users, call counts, latency p50/p95/max and pass status. Successful stages also include elapsed workload time and observed throughput. Latency spans each service call, including pool wait, scoped transaction overhead and legacy Redis receipt lookup. Setup, migrations and final read-back verification are excluded.

`cumulativeGameplayTransactions`, `cumulativeGameplayQueries` and `cumulativeRedisCommands` count only application calls during the workload across stages. They exclude migration/read-back/cleanup calls, transaction BEGIN/COMMIT and the isolation provider's SQL setup queries; they are not database-wide query metrics. Expected successful totals for the current path: 96 gameplay transactions, 608 gameplay queries (80 new batches times seven, plus 16 replays times three) and 80 legacy Redis GETs. These counts show that PostgreSQL is used per batch, not absorbed by a Redis write-behind queue.

## Validation status

Local automated tests validate bounded scheduling, replay checks with the in-memory adapter, early stop, latency math, missing connection refusal, read-back failure and cleanup lifecycle. Their simulated clock results are **not** real-infrastructure performance measurements. Local runtime is Node 24.19.0; the deployed project targets Node 22.

The preceding isolated correctness/throttling test and cleanup were reported successful by the user. The new load runner's real Render execution is pending until its stage output and final clean marker are obtained. Sustained load, database pool/lock telemetry and intended production concurrency remain separate release checks.
