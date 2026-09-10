# Architecture

## Runtime boundaries

The frontend is React 18 with React Router, Zustand and Axios. Pages are lazy-loaded. UI components render state; hooks coordinate lifecycle behavior; services own HTTP, Telegram and wallet interactions; Zustand slices hold user, game, wallet and inventory state.

The server core uses the standard `Request`/`Response` API in `server/src/app.ts`. `server/src/worker.ts` is the production composition root and fails closed if Redis or PostgreSQL is absent. `server/productionServer.mjs` supplies pooled PostgreSQL and TLS Redis adapters for a Node host, health checks, periodic queue flushing and graceful shutdown. `server/localServer.mjs` remains development-only and in-memory.

## Authenticated request sequence

```mermaid
sequenceDiagram
  participant T as Telegram
  participant C as Client
  participant A as API
  participant R as Redis
  participant P as PostgreSQL
  C->>T: Read initData
  C->>A: POST /api/auth/telegram
  A->>A: Verify Telegram HMAC and freshness
  A-->>C: 15-minute JWT and session signing key
  C->>A: Signed request with timestamp and nonce
  A->>R: Reserve nonce atomically
  A->>A: Validate signature and server-owned state
  A->>P: Lock player row; commit batch receipt, state and event atomically
  A->>R: Update derived leaderboard
  A-->>C: Authoritative result
```

## Domain ownership

| Domain | Client | Server | Production persistence |
|---|---|---|---|
| Authentication | Telegram SDK and token memory | initData/JWT/request verification | Redis nonce TTL |
| Game | durable local outbox and optimistic display | energy, rate, income, offline profit | PostgreSQL row-locked state + durable batch receipts |
| Economy | display | versioned formulas and price checks | economy config binding |
| Commerce | catalog/inventory UI | idempotent purchase/payment handling | PostgreSQL/provider verifier |
| Social | mission/daily/referral UI | eligibility, claims, anti-abuse | PostgreSQL + Redis leaderboard |
| Admin | separate protected routes | separate JWT role/scope checks | production admin/audit adapter |

## Failure model

- Redis must be shared by every API instance for request nonce protection, rate limits, admin OTP protection and rankings.
- PostgreSQL writes use conflict-safe keys for claims and idempotency.
- Each tap **batch**, not each individual tap, commits state, receipt and audit event in one PostgreSQL transaction before acknowledgement. Offline credit uses the same player row lock. Production does not read mutable state from a process-local cache.
- Redis-first tap write-behind is no longer the production durability model. The existing queue flusher drains legacy events only; its old load tests are not production capacity evidence. Benchmark transaction latency and pool saturation before launch.
- Client retries keep their batch ID and sealed duration; accepted or explicitly rejected batches are reconciled with the server and removed from the outbox. Network errors stay queued.
- Payment callbacks must be verified and deduplicated by transaction ID.
- Anomalies are recorded for review and do not automatically ban a player on the first event.

See [persistence reliability](PERSISTENCE_RELIABILITY.md) for rollout, recovery tests and remaining limits.
