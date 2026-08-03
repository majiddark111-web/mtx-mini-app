# Lumos Phase 3 — Game Core

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
- Tests: 16 passed, including authenticated API rejection above 15 taps/second
- Queue load test: 2,000 sync events remained in the hot queue; 100 user states were persisted only during flush

## Deployment boundary

Development can use the in-memory adapters. Production must provide real `REDIS` and `POSTGRES` bindings implementing the interfaces in `server/src/productionStorage.ts`. A shared Redis-backed hot-state/nonce strategy is still required before horizontally scaling to multiple server instances; process memory alone is not a distributed consistency mechanism.

The production bundle could not be regenerated in this workspace because the interrupted package installation left an esbuild host/binary version mismatch. Type checks, lint, and all tests ran successfully. A clean `pnpm install --frozen-lockfile` restores the matching binary before `pnpm build`.
