# Deployment guide

## 1. Provision infrastructure

- HTTPS frontend/CDN for the Vite `dist` directory.
- Fetch-compatible JavaScript API runtime with scheduled jobs and WebSocket upgrades.
- PostgreSQL with backups, TLS and least-privilege credentials.
- Shared Redis with persistence/replication appropriate to the reward risk.
- Secret manager for Telegram, JWT, admin and provider credentials.
- Payment/chain verifier that independently queries TON/USDT transaction truth.

Apply all pending migrations before accepting traffic:

```bash
pnpm db:migrate
```

## 2. Configure server values

| Name/binding | Required | Description |
|---|---:|---|
| `TELEGRAM_BOT_TOKEN` | yes | BotFather token; server only |
| `JWT_SECRET` | yes | Random player JWT/request derivation secret, ≥32 characters |
| `ADMIN_JWT_SECRET` | yes for admin | Separate random admin JWT secret, ≥32 characters |
| `APP_ORIGIN` | yes | Exact HTTPS frontend origin |
| `AUTH_MAX_AGE_SECONDS` | yes | Telegram initData freshness; recommended `300` |
| `DATABASE_URL` | Node production | PostgreSQL connection URL; server-only |
| `REDIS_URL` | Node production | TLS Redis URL (`rediss://` in production); server-only |
| `POSTGRES_POOL_MAX` | optional | Maximum PostgreSQL pool size; defaults to `10` |
| `POSTGRES_TLS_REJECT_UNAUTHORIZED` | optional | Keep `true`; disable only for a controlled private CA |
| `ECONOMY_CONFIG` | recommended | Runtime configuration provider with `get(key)` |
| `PAYMENT_VERIFIER` | payments | Server-side TON/USDT verification interface |
| `LEADERBOARD_PUBSUB` | realtime | Shared publish/subscribe binding |
| `LEADERBOARD_WEBSOCKET` | realtime | WebSocket upgrade binding |
| `ADMIN_AUTH` | admin | Separate username/password/OTP or identity-provider adapter |

Generate secrets with a cryptographic secret manager. Never prefix a secret with `VITE_`.

## 3. Build the frontend

Set build-time public values:

```text
VITE_API_BASE=https://api.mtxgame.com
VITE_LEADERBOARD_WS=wss://api.mtxgame.com/api/leaderboard/live
```

Then run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
```

Upload `dist/` to the frontend host. Configure SPA fallback to `index.html`, immutable caching for hashed assets, short caching for `index.html`, Brotli/gzip compression, CSP and HSTS.

## 4. Deploy the API

For Render or another Node host, run migrations as a pre-deploy command and start the persistent API:

```bash
pnpm db:migrate
pnpm server:start
```

Configure `/healthz` as the health-check path. The runtime persists dirty game state before returning, flushes queued tap events every five seconds and performs a final flush during graceful shutdown. Do not deploy `server/localServer.mjs` as the production runtime.

The repository root includes `render.yaml` for a free Singapore staging service. Because Render's dedicated `preDeployCommand` is a paid-service feature, the free staging Blueprint runs the idempotent migration at the end of `buildCommand`. Move `pnpm db:migrate` to `preDeployCommand` before upgrading this Blueprint to a paid production service.

Fetch-compatible platforms may still inject their own `REDIS` and `POSTGRES` bindings into `server/src/worker.ts`. Payment verification, WebSocket transport and administrator identity remain separate provider responsibilities.

## 5. Configure Telegram

1. Set the Mini App URL in BotFather to the HTTPS frontend.
2. Ensure `APP_ORIGIN` exactly matches that origin.
3. Update `public/tonconnect-manifest.json` with final production URLs and icons.
4. Set `VITE_TELEGRAM_BOT_USERNAME` on the frontend to the username without `@` (for staging: `TOKXTAPBOT`).
5. Open `https://t.me/TOKXTAPBOT?startapp` and verify the configured bot launches the Mini App.
6. Confirm forged/expired initData is rejected before enabling rewards.

## 6. Release gates

- All tests, checks, lint and production build pass.
- PostgreSQL schema and rollback backup are verified.
- Redis is shared across every API instance.
- Payment replay test cannot double-credit.
- Player JWT cannot reach admin endpoints.
- Forged signature, reused nonce and impossible tap rate are rejected.
- Lighthouse on the final HTTPS URL meets TTI <2.5s and CLS <0.1 on the agreed mid-range profile.
- Alerts exist for error rate, Redis/PostgreSQL latency, payment failures and anomaly volume.

## Operations and rollback

Deploy immutable frontend/API versions. Keep the previous artifacts and database migration backup. Roll back application code first; never delete user state to resolve a release issue. Rotate compromised secrets, invalidate affected sessions, preserve audit logs and reconcile payment records before restoring credits.
