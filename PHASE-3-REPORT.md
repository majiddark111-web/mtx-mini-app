# MTX Phase 3 — Game Core

## Approved parameters

- Sync: every 2 seconds or 50 taps, whichever happens first
- Maximum plausible rate: 15 taps/second
- Energy: 1,000 maximum; 1 energy/second recharge from server timestamps
- Offline profit: `profitPerHour × min(hoursOffline, 3)`
- Starting profit per tap: 1; starting profit per hour: 0 until Phase 4 economy configuration
- XP: 1 XP per accepted tap; level: `floor(sqrt(XP / 100)) + 1`
- Ranks: Bronze 1–9, Silver 10–19, Gold 20–29, Platinum 30–49, Diamond 50+
- Critical, combo, auto-tap, and boost stacking are explicitly disabled until Phase 4 defines their economic impact.

## Delivered

- Server-authoritative coins, energy, recharge, XP, level, rank, and offline profit
- Authenticated `GET /api/game/state` and `POST /api/game/taps`
- Strict tap-batch schema, idempotent batch IDs, and duplicate rejection
- Implausible batches earn zero coins and increment the account flag counter
- Optimistic client taps with reconciliation against server state
- Redis queue adapter and PostgreSQL repository adapter
- Hot-state write-behind with periodic PostgreSQL flush instead of a database write per tap
- PostgreSQL schema in `server/schema.sql`

## Verification

- Frontend and backend TypeScript checks: passed
- ESLint: passed
- Tests: 17 passed, including authenticated API rejection above 15 taps/second
- Queue load test: 5,000 events produced 5,000 Redis commands while PostgreSQL received zero writes before flush and 100 batched user-state writes after flush
- Production frontend build: passed (134 modules, 274.20 kB JavaScript / 92.08 kB gzip)

## Deployment boundary

Development can use the in-memory adapters. Production must provide real `REDIS` and `POSTGRES` bindings implementing the interfaces in `server/src/productionStorage.ts`. A shared Redis-backed hot-state/nonce strategy is still required before horizontally scaling to multiple server instances; process memory alone is not a distributed consistency mechanism.

The installed Vite 6 tree in this workspace still contains an esbuild host/binary mismatch from the interrupted package installation. The same source was therefore verified with the intact Vite 4 toolchain already present in the workspace and produced `dist-phase3`. A clean `pnpm install --frozen-lockfile` is still required on a deployment machine to restore the declared Vite 6 toolchain.
