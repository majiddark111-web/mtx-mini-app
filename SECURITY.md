# Lumos security boundary

This package is a client-side demo. Browser state is deliberately used for local continuity and is not trustworthy currency or reward data.

Phase 2 now validates Telegram `initData`, checks freshness, issues short-lived JWTs, validates endpoint input and applies IP/user rate limits. Before real rewards are enabled, Phase 3 must still make score and energy authoritative, idempotently process tap batches, and execute boost purchases atomically. Later phases must verify tasks and referrals and sign/record every wallet or withdrawal operation. Never accept a score, balance, upgrade level, task completion, referral identity, or energy value supplied by this client as authoritative.
