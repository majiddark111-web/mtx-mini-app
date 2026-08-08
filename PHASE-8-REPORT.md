# Phase 8 — Anti-Cheat Verification

## Implemented controls

- HMAC-SHA256 signing for every authenticated player HTTP request.
- Per-session signing key derived from the validated Telegram JWT session.
- Canonical payload covers method, path, timestamp, nonce, and SHA-256 body hash.
- 30-second timestamp acceptance window.
- Atomic Redis `SET NX PX` replay protection in production; bounded in-memory adapter for local use.
- Constant-time signature comparison.
- Server-side anomaly records for forged signatures, stale timestamps, replay attempts, invalid nonces, and implausible tap rates.
- Protected admin anomaly endpoint; anomalies are flagged for review and never cause an automatic first-event ban.

## Definition of Done

- Forged signature test: passed.
- Replayed request test: passed.
- Stale request test: passed.
- Server-authoritative max tap-rate test: passed.
- Client and server TypeScript checks: passed.
- ESLint with zero warnings: passed.
- Tests: 38 passed, 0 failed.
- Production build: passed (Vite, 150 modules).

## Security boundary

Client request signing raises the cost of basic request tampering and provides replay protection, but it does not make a user-controlled device trusted. Economy, energy, rewards, payments, and tap validation remain server-authoritative. A real deployment must use shared Redis, TLS, protected secrets, centralized audit storage, and tuned anomaly rules.
