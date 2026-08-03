# Lumos Phase 6 — Missions, Daily, Referral, Leaderboard, Profile

## Delivered

- Daily reward with seven-day streak, one claim per UTC day, and server-side coin credit
- Daily, weekly, and monthly missions with progress, completion checks, and idempotent claim behavior
- Referral codes and rewards: 500 MTX referrer / 250 MTX referee
- Explicit referral protections: self-referral, repeated referral use, and duplicate device hash are rejected
- Global leaderboard adapter backed by Redis sorted-set commands in production
- Profile with coins, XP, level, rank, profit, inventory count, payments, and referral stats
- Working Missions, Daily Reward, Referral, Leaderboard, and Profile pages
- PostgreSQL schemas for claims and referrals

## Verification

- Frontend/backend TypeScript and ESLint: passed
- Tests: 30 passed
- Simulated leaderboard: 10,000 users sorted; top 100 verified
- Redis adapter test verifies `ZADD`, `HSET`, `ZREVRANGE`, and name lookup commands
- Production build: passed; 147 modules, 287.35 kB JavaScript / 95.32 kB gzip

## Remaining production integrations

- The UI refreshes rankings every five seconds. A platform WebSocket gateway/pub-sub binding is still required to meet true push-based near-real-time updates.
- Daily, mission, and referral runtime stores are currently in-memory; wire them to the supplied PostgreSQL tables before multi-instance deployment.
- A client-generated device fingerprint is only a friction control and can be forged. Production referral protection should combine a server-signed device cookie, IP/risk signals, Telegram account age where legally available, and manual anomaly review.
- Friends/weekly/monthly/season leaderboard partitions require Redis keys and season scheduling in deployment configuration.
- Daily Combo and Daily Cipher content require product rules/content and are not fabricated in this phase.

The core Phase 6 pages and reward flows are functional. Full Phase 6 infrastructure DoD remains open for WebSocket push and durable social persistence.
