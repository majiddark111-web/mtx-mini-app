# Lumos security boundary

This package is a client-side demo. Browser state is deliberately used for local continuity and is not trustworthy currency or reward data.

Before real rewards are enabled, the backend must validate Telegram `initData`, own the authoritative score and energy clocks, rate-limit and idempotently process taps, execute boost purchases atomically, verify tasks and referrals, and sign/record every wallet or withdrawal operation. Never accept a score, balance, upgrade level, task completion, referral identity, or energy value supplied by this client as authoritative.
