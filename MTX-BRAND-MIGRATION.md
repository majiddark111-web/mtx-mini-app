# MTX brand migration

The project identity has been migrated from its former development name to **MTX** before production data was introduced.

Updated surfaces include:

- UI labels, page title, metadata, game CTA and admin console.
- Package identity and technical documentation.
- Telegram Cloud Storage and browser persistence keys.
- TON Connect manifest and sample bot/domain references.
- Player request headers (`X-MTX-*`) and request-signing derivation context.
- Admin JWT scope (`mtx:admin`).
- Referral codes (`MTX-*`) and daily cipher answer.
- Redis queues, nonce keys, leaderboard keys and pub/sub channel.
- PostgreSQL table and index prefixes (`mtx_*`).
- Tests, schemas, reports and changelog filename.

Verification: client/server TypeScript passed, ESLint passed, 38/38 tests passed, and the production build completed successfully.

Because this migration occurred before production deployment, no live data migration is required. If any environment was initialized with the previous schema or cache namespace, export and migrate that data before applying `server/schema.sql` or switching Redis keys.
