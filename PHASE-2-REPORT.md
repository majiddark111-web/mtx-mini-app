# MTX Phase 2 report

## Status

Phase 2 is complete. Phase 3 game authority and tap batching have not started.

## Delivered

- Worker-compatible TypeScript backend using Web Standard `Request`, `Response` and Web Crypto APIs.
- Official Telegram Mini App `initData` HMAC-SHA256 validation.
- Constant-time signature comparison, required `auth_date`, five-minute default expiry and future timestamp protection.
- Strict Telegram user parsing; `initDataUnsafe` is never accepted by the backend.
- HS256 JWT issuance only after successful Telegram validation; 15-minute session lifetime.
- Protected `/api/session` endpoint requiring a valid, unexpired JWT.
- Schema-based strict input validation on every implemented endpoint.
- Per-IP limits for every request and per-user limits after authentication.
- Origin allow-list and CORS headers limited to `APP_ORIGIN`.
- Frontend authentication exchange using raw `Telegram.WebApp.initData`; token remains in memory.
- Telegram user/avatar, theme updates, Haptic Feedback, Cloud Storage metadata, Back Button and Main Button integration.
- Local browser demo remains usable when Telegram `initData` is absent; no server-authenticated reward is granted in that mode.

## Endpoints

- `POST /api/auth/telegram` — the only public application endpoint; validates Telegram data and returns a short-lived JWT.
- `GET /api/session` — protected; validates the bearer JWT and returns the authenticated Telegram profile.

Unknown routes return 404. CORS preflight is handled without authentication as required by browsers.

## Environment

- `TELEGRAM_BOT_TOKEN` — backend secret from BotFather.
- `JWT_SECRET` — random secret of at least 32 characters.
- `APP_ORIGIN` — exact deployed frontend origin.
- `AUTH_MAX_AGE_SECONDS` — 60–3600, default 300.
- `VITE_API_BASE` — public backend origin used by the frontend.

Never place the bot token or JWT secret in a `VITE_` variable.

## Verification

- Frontend TypeScript: passed with zero errors.
- Backend TypeScript: passed with zero errors.
- ESLint: passed with zero warnings/errors.
- Tests: 11 passed, 0 failed.
- Security tests reject tampered data, forged hashes, expired Telegram sessions, missing JWTs and unknown input fields.
- Rate-limit bucket enforcement and reset are covered by test.
- Production frontend build: passed; 132 modules transformed.

## Production boundary

The included rate limiter is correct for a single Worker/process instance. A distributed production deployment must back the same limiter interface with Redis or a Cloudflare Durable Object so limits are shared across replicas; Redis is already scheduled in Phase 3. Game score, energy, boosts and mission rewards remain local demo state and must not be treated as authoritative until Phase 3.

## Commits

- `c36f4b8` — Telegram-validated authentication backend.
- `8e656d0` — frontend Telegram secure-session integration.

Do not start Phase 3 until this report and the Telegram/BotFather deployment inputs are reviewed.
