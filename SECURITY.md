# Lumos security boundary

Lumos validates Telegram `initData` server-side before issuing a short-lived player JWT. Authenticated HTTP requests use a per-session HMAC signature, a 30-second timestamp window and one-time nonces. Production replay protection uses atomic Redis operations. Tap rate, energy, offline profit, purchases, claims and payment credits are calculated or verified by the server.

The browser remains an untrusted device. Request signing does not make client code authoritative because a determined user controls the browser and its memory. Never accept client-reported balance, energy, upgrade state, task completion, payment result or referral identity.

Production requirements include HTTPS, separate player/admin secrets, a real Telegram bot token, shared Redis, PostgreSQL, server-side payment verification, centralized anomaly/audit retention and secret-manager injection. Rotate a secret immediately if it appears in logs, source control or a `VITE_` variable. Security events are flagged for review; the system deliberately avoids automatic banning on a first anomaly.

Report vulnerabilities privately to the project owner. Do not include bot tokens, JWTs, payment identifiers or personal Telegram data in a report.
