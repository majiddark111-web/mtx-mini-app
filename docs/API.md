# API reference

All responses are JSON. Player endpoints require `Authorization: Bearer <jwt>` and the three request-signing headers below. The auth endpoint and admin login are exceptions. Admin endpoints accept only a separately issued admin JWT.

## Player request signing

Headers:

- `X-MTX-Timestamp`: Unix milliseconds, accepted within ±30 seconds.
- `X-MTX-Nonce`: unique 16–80 character URL-safe value.
- `X-MTX-Signature`: base64url HMAC-SHA256 signature.

Canonical input:

```text
METHOD
/pathname
timestamp
nonce
base64url(sha256(exact_request_body))
```

The browser interceptor creates these automatically. A repeated nonce returns `409`; a missing, stale or forged signature returns `401`.

## Authentication and game

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/telegram` | Validate `{ initData }`; return user, player JWT and session signing key |
| GET | `/api/session` | Return authenticated Telegram user |
| GET | `/api/game/state` | Apply offline profit and return authoritative game state |
| POST | `/api/game/taps` | Validate and apply `{ taps, durationMs, batchId }` |
| GET | `/api/economy/config` | Return active versioned economy configuration |

Tap batches above 15 taps/second are rejected and flagged. The client normally synchronizes every 2 seconds or 50 taps. Energy and offline time are derived on the server.

## Commerce and wallet

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/store/catalog` | Server-priced catalog and current balance |
| POST | `/api/store/purchase` | Idempotent `{ itemId, idempotencyKey }` coin purchase |
| GET | `/api/inventory` | Owned items and purchase history |
| GET | `/api/wallet/transactions` | Payment history |
| POST | `/api/wallet/payments/intents` | Create a user-bound, 15-minute TON payment order in Redis |
| POST | `/api/wallet/payments/confirm` | Verify provider transaction server-side |

The Testnet flow embeds the server-issued order ID in the TON message, then matches sender, treasury, amount and order through TON Center. A transaction ID can credit only once. USDT remains disabled until its Jetton contract and verification rules are configured.

## Social

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/missions` | Current mission progress |
| POST | `/api/missions/claim` | Claim `{ missionId }` once eligible |
| GET | `/api/daily` | Daily reward state |
| POST | `/api/daily/claim` | Claim current daily reward |
| GET | `/api/daily/challenges` | Daily combo and cipher |
| POST | `/api/daily/challenges/claim` | Claim `{ type, answer }` |
| GET | `/api/referral` | Referral status and code |
| POST | `/api/referral/accept` | Accept `{ code, deviceHash }` with abuse checks |
| GET | `/api/leaderboard` | Ranked Redis leaderboard snapshot |
| GET/WS | `/api/leaderboard/live` | JWT-authenticated real-time rankings |
| GET | `/api/profile` | Aggregated player profile |

## Admin

`POST /api/admin/auth` accepts `{ username, password, otp }` through the external `ADMIN_AUTH` binding. It returns a short-lived admin JWT with a separate secret and scope.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Aggregate operational metrics |
| GET | `/api/admin/users` | User/game states and ban status |
| GET | `/api/admin/payments` | Payment records |
| GET | `/api/admin/items` | Current catalog preview |
| GET | `/api/admin/logs` | Admin audit log |
| GET | `/api/admin/anomalies` | Anti-cheat flags for manual review |
| GET/POST | `/api/admin/notifications` | List/create announcements |
| GET/POST | `/api/admin/events` | List/create timed multipliers |
| POST | `/api/admin/users/ban` | Set `{ userId, banned }` |

## Common errors

| Status | Meaning |
|---|---|
| 400 | Schema or JSON validation failed |
| 401 | Missing/invalid player auth or request security failure |
| 402 | Insufficient coins |
| 403 | Origin, ban or admin authorization failure |
| 409 | Replay, duplicate state transition or unavailable item |
| 422 | Implausible tap batch |
| 429 | IP/user rate limit exceeded |
| 503 | Required production provider unavailable |
