# MTX security boundary

MTX validates Telegram `initData` server-side before issuing a short-lived player JWT. Authenticated HTTP requests use a per-session HMAC signature, a 30-second timestamp window and one-time nonces. Production replay protection uses atomic Redis operations. Tap rate, energy, offline profit, purchases, claims and payment credits are calculated or verified by the server.

The browser remains an untrusted device. Request signing does not make client code authoritative because a determined user controls the browser and its memory. Never accept client-reported balance, energy, upgrade state, task completion, payment result or referral identity.

## Shared server-time tap allowance

Tap sync now has a per-player token bucket in PostgreSQL game state: a maximum burst allowance of 50 taps, replenished at 15 taps/second using API server time. This is a sustained bound with a network-jitter allowance, not a strict 15-event limit in every individual second. Over an interval, newly budgeted taps cannot exceed its starting allowance plus 15 times elapsed seconds. Client `durationMs` cannot add allowance.

The allowance is checked under the same player row lock as state/receipt persistence. Different sessions, new batch IDs, concurrent API instances, game-state reads and process restarts do not create fresh buckets. Successful receipt replays do not spend allowance again. Failed transactions do not spend it. Older state without the optional budget gets one initial burst; subsequent accepted batches persist the budget atomically. Backwards server time cannot refill it. Keep API host clocks synchronized.

An exhausted bucket returns retryable `429` with `Retry-After` and `retryAfterMs`, without a receipt or score mutation. The client retains that batch for retry. Network reconnection can legitimately cause a burst, so this condition does not automatically flag or ban players. The existing per-batch implausible-rate check still returns terminal `422` and records an anomaly.

This bounds aggregate tap income, but does not prove human input or stop automation operating within the allowance. Energy, account abuse, monitoring and payment verification remain separate controls. No new schema migration or environment variable is needed; the optional budget lives in existing JSON state. Rolling back to older application code removes this enforcement.

Production requirements include HTTPS, separate player/admin secrets, a real Telegram bot token, shared Redis, PostgreSQL, server-side payment verification, centralized anomaly/audit retention and secret-manager injection. Rotate a secret immediately if it appears in logs, source control or a `VITE_` variable. Security events are flagged for review; the system deliberately avoids automatic banning on a first anomaly.

Report vulnerabilities privately to the project owner. Do not include bot tokens, JWTs, payment identifiers or personal Telegram data in a report.
