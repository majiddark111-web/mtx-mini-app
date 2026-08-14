# MTX Phase 6 — Missions, Daily, Referral, Leaderboard, Profile

## Delivered

- Daily reward with seven-day streak, one claim per UTC day, and server-side coin credit
- Daily, weekly, and monthly missions with progress, completion checks, and idempotent claim behavior
- Referral codes and rewards: 500 MTX referrer / 250 MTX referee
- Explicit referral protections: self-referral, repeated referral use, and duplicate device hash are rejected
- Global leaderboard adapter backed by Redis sorted-set commands in production
- Profile with coins, XP, level, rank, profit, inventory count, payments, and referral stats
- Working Missions, Daily Reward, Referral, Leaderboard, and Profile pages
- Daily Combo and Daily Cipher with server-only answer validation and one claim per UTC day
- Configurable authenticated WebSocket client with five-second polling fallback
- PostgreSQL schemas for claims and referrals
- PostgreSQL social repository wired in production with conflict-safe claims
- JWT-authenticated WebSocket gateway core with Redis Pub/Sub subscription

## Verification

- Frontend/backend TypeScript and ESLint: passed
- Tests: 33 passed
- Simulated leaderboard: 10,000 users sorted; top 100 verified
- Redis adapter test verifies `ZADD`, `HSET`, `ZREVRANGE`, and name lookup commands
- Production build: passed; 147 modules, 287.35 kB JavaScript / 95.32 kB gzip

## Deployment requirements

- Bind the platform WebSocket upgrade implementation to `LEADERBOARD_WEBSOCKET`, Redis Pub/Sub to `LEADERBOARD_PUBSUB`, and set `VITE_LEADERBOARD_WS`. The gateway core validates JWT before subscribing; polling remains the safe fallback.
- Bind production PostgreSQL through `POSTGRES`; the Worker then uses `PostgresSocialPersistence` automatically. Local development intentionally uses memory adapters.
- A client-generated device fingerprint is only a friction control and can be forged. Production referral protection should combine a server-signed device cookie, IP/risk signals, Telegram account age where legally available, and manual anomaly review.
- Friends/weekly/monthly/season leaderboard partitions require Redis keys and season scheduling in deployment configuration.
- Combo/Cipher defaults are functional starter content; production should rotate their answers and hints through the runtime content service rather than source deployments.

The Phase 6 application and production adapters are complete and locally verified. Operational acceptance remains: deploy the provided bindings, run migrations, and load-test the actual Redis/PostgreSQL/WebSocket services because no live infrastructure credentials are present in this workspace.
