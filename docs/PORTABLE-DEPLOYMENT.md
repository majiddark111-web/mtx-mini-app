# MTX portable deployment runbook

## Scope and invariants

Existing application code and SQL migrations are preserved. Render configuration remains for rollback compatibility but is not used by the portable stack.
This is a single-host deployment, not high availability. A host/disk failure can affect API, PostgreSQL and Redis together.
No migration, remote write, paid subscription, DNS change or deletion is performed by creating this package.
The package contains source, not a database dump, secrets, dependencies or prebuilt container images.

Topology: Telegram/browser -> HTTPS Caddy + static frontend -> private API -> PostgreSQL and Redis.
Only 80/TCP, 443/TCP and 443/UDP are published. Restrict SSH to operator addresses.
The Docker network permits outbound API requests to Telegram and TON Center. Do not publish port 3000, 5432 or 6379.
Caddy sets the source-IP header used by this API, replacing untrusted client values. This configuration assumes clients reach Caddy directly, not through an additional CDN/proxy. Reconfigure trusted proxies explicitly before adding one.
API paths are forwarded intact because request signatures include the pathname.

The portable frontend uses same-origin /api routes. The wallet manifest is generated at image build time from the domain.
Changing the domain requires rebuilding the frontend and recreating the API/web services, not just restarting a container.
Current wallet UI and verification remain TON Testnet only; the portable preflight rejects a mainnet verifier URL.
Current Node production leaderboard uses the existing polling fallback; this package does not add a WebSocket upgrade implementation.
Current durable tap path writes PostgreSQL transactions per accepted batch; it is not a new Redis write-behind design.

## Prerequisites

A Linux host with Docker Engine and Compose v2 supporting health-based dependencies and --wait; Node.js 22 for setup and local checks.
The image runs Node.js 22; pnpm is pinned in the Dockerfile. Base images track explicit major release lines, not immutable digests.
Resolve and record image IDs/digests during acceptance, and keep previous release images for rollback.
Internet access is needed to build/pull images and reach Telegram/TON services.
Use PostgreSQL 18 for restoring the existing version-18 dump. Do not restore into an older major version.
The host clock must synchronize automatically, otherwise Telegram authentication, signed requests and admin TOTP can fail.

Extract the ZIP into a dedicated directory, outside any existing production installation.
Run commands below from the extracted project root unless stated otherwise.
Replace YOUR_REAL_DOMAIN with the real hostname only (no https:// or slash); example.com placeholders are rejected.

## 1. Initialize once

```sh
node server/deployment/initialize.mjs YOUR_REAL_DOMAIN
```

Creates deploy/.env and deploy/secrets, with fresh, separate JWT keys and infrastructure passwords.
It refuses to replace an existing .env or secrets directory. Do not rerun to rotate an existing database password.
On Linux, generated files are mode 0600 and the secrets directory is 0700.
The configured API UID/GID matches the generating non-root user, or 1000 when initialized by root.
Root initialization assigns secret-file ownership to that API UID/GID. Keep these ownerships when uploading files.
Do not change the API user to root to work around permissions.

Privately edit deploy/secrets/api.json, retaining JSON quotes:
- TELEGRAM_BOT_TOKEN: the BotFather token, never the bot username.
- ADMIN_USERNAME: your operator name.
- ADMIN_PASSWORD_HASH: existing scrypt hash, not the plaintext password. Existing server/adminCredentials.mjs implements the format.
- ADMIN_TOTP_SECRET: the Base32 authenticator seed; enroll the matching account privately.
- TONCENTER_API_KEY: your Testnet key.
- TON_TREASURY_ADDRESS: your Testnet receiving address, not a recovery phrase.
- Keep generated JWT_SECRET and ADMIN_JWT_SECRET; they intentionally invalidate old sessions.
- MTX_BOT_USERNAME is public in deploy/.env and defaults to TOKXTAPBOT.

Never use a VITE_ variable for a secret. Never commit or paste these files into chat.
Keep an encrypted off-server copy of the secrets in an operator-controlled vault.
If Redis is replaced rather than migrated, also change the admin TOTP seed and enroll it again: the old consumed-code history is not present in a fresh Redis.

## 2A. All components on this host

The helper defaults to the self-hosted configuration. DATABASE_URL and REDIS_URL in api.json are ignored and generated from private secret files in this mode.

```sh
sh deploy/mtx.sh config
sh deploy/mtx.sh build
sh deploy/mtx.sh data
sh deploy/mtx.sh check
```

Build does not contact the existing Render databases.
The data command starts only private TLS initialization, PostgreSQL and Redis. It does not run application migrations or start the game.
PostgreSQL has a separate superuser password; API uses the non-superuser mtx role, which owns the application database/schema.
The PostgreSQL 18 volume mounts /var/lib/postgresql, not the pre-18 data-directory path.
Redis uses TLS, password authentication, AOF, appendfsync always and noeviction with a 256 MB data budget. Monitor memory; increase this budget and host capacity before pressure causes writes to fail.
Disk persistence is not an off-server backup.

The API receives only the public private-CA certificate. CA private keys and server private keys are mounted only in their required services.
Private service certificates expire after five years; initialization refuses certificates within seven days of expiry.
Record their expiry dates and renew/validate replacements before that deadline. A partially initialized TLS volume fails closed; inspect it rather than deleting populated volumes.
Caddy manages the public website certificate separately in its own persistent volumes.

If starting a genuinely new empty game, skip to step 3.
For migration of existing players, restore first, BEFORE running migrate/start.

## 2B. Managed PostgreSQL and Redis

Use this alternative instead of 2A. Do not start the self-hosted data services.

Set DATABASE_URL and REDIS_URL privately in api.json to the new provider.
PostgreSQL TLS certificate verification is required; Redis must use rediss:// with a password.
Connection URL query parameters are rejected to prevent driver TLS overrides. If a provider URL includes sslmode=require, use its host/database/credentials without the query: this launcher already enforces certificate-verified TLS.
Providers using a private CA need an explicitly mounted public CA certificate and NODE_EXTRA_CA_CERTS on both API and migration containers. Never disable certificate verification.

```sh
MTX_INFRA=external sh deploy/mtx.sh config
MTX_INFRA=external sh deploy/mtx.sh build
MTX_INFRA=external sh deploy/mtx.sh check
```

Restore the trusted backup into a NEW EMPTY database using PostgreSQL 18 tools or the provider's documented restore process.
Use one transaction, stop on errors, and omit original owners/privileges. Do not use --clean or --create against a database with existing data.
The external provider account must be able to own/create MTX tables and run migrations without being a superuser.
The helper's backup/restore/data commands deliberately only operate on the self-hosted database, never on an arbitrary external URL.
A managed-provider backup schedule and restore drill must be configured and verified separately.

## Restore into the empty self-hosted database

Use ONLY a trusted archive; PostgreSQL dumps can execute SQL.
Copy it securely to deploy/backups/source.backup (outside the source-control archive).
The previously verified MTX backup is dated 2026-09-16. Determine whether a newer backup or reconciliation is needed. Its earlier 19 checks compared counts only.

Stop the old application's writes and confirm a final source backup before the actual cutover.
Keep both the original archive and its checksum. Do not put real data in this project's ZIP.
Start only the destination data services as shown in 2A, then:

```sh
MTX_RESTORE_CONFIRM=EMPTY_MTX_DATABASE sh deploy/mtx.sh restore backups/source.backup
```

The helper refuses to restore while the destination API/web are running or user tables/views/sequences exist.
It uses --single-transaction --exit-on-error --no-owner --no-privileges.
It never drops a database or cleans existing tables.
After restore, compare migration versions, row counts AND selected player balances, purchases, referrals, payment transaction IDs and daily claims with the source.
Use the old count-check file only for its matching September-16 archive, not as an expected count for newer data.

Fresh Redis does not contain the old rankings, nonces, rate counters or admin consumed-code counters.
Rotate both JWT secrets and the admin TOTP seed as above; require fresh player login.
Check leaderboard behavior and reconcile/rebuild ranking data before user traffic. This package does not claim to migrate Redis state automatically.
For an exact Redis migration, the source provider's export capabilities and compatibility must first be verified.

## 3. Preflight, migrations and startup

For self-hosted mode:

```sh
sh deploy/mtx.sh check
sh deploy/mtx.sh migrate
sh deploy/mtx.sh start
sh deploy/mtx.sh status
```

For external mode, prefix EVERY helper call with MTX_INFRA=external.
Do not use the plain start command after an external-mode setup.
Migrations are protected by the existing advisory lock/checksums. The API starts only after migration success; the frontend waits for API health.
Never edit previously applied migration SQL to force a mismatch to pass.

Point the final hostname's DNS to this host and allow public certificate validation over ports 80/443.
With the actual hostname substituted, verify:

```sh
curl --fail https://YOUR_REAL_DOMAIN/healthz
curl --fail https://YOUR_REAL_DOMAIN/tonconnect-manifest.json
```

The health response must be {"status":"ok"} and the manifest must reference the same new hostname.
Check /admin/login and direct links, missing /assets files returning 404, and rejection of unauthenticated API requests.
Only after acceptance update the Telegram bot's Mini App URL through BotFather. Keep the bot identity unchanged.
Do not operate old and new installations as independent writers for the same players.

## 4. Acceptance before cutover

- Fresh Telegram login, taps/energy/reconnect and restart persistence.
- Daily/mission/referral claims are not duplicated.
- Store purchase, inventory activation, skins and upgrades.
- Testnet wallet connect, payment confirmation and replay rejection.
- Admin login plus a replayed OTP rejection.
- Same-origin signed requests and sensible client IP rate limits.
- API/Redis/PostgreSQL container restart and persistent data.
- Backup followed by restore into another empty isolated environment.
- Actual TLS, container permissions, migrations, resource use and a bounded load test on the selected host.
- Confirm database counts and specific balance/payment records, not just a green health endpoint.

Do not run the isolated load/integration commands against live users without reviewing their safeguards and target.
Never interpret an image build, health check or local unit tests alone as production acceptance.

## 5. Backups and operations

Self-hosted manual verified archive:

```sh
sh deploy/mtx.sh backup
```

A dump is written to a uniquely named .partial file; only after two archive-read checks does it become .backup.
A failed attempt leaves its .partial file for inspection; it is not a successful backup.
A SHA-256 sidecar is written. Verification is readability, not a substitute for a restore drill.
Copy backups encrypted to another host/provider with limited-access credentials and define retention/RPO.
Schedule backups and failure notifications AFTER the off-server destination is selected. No recurring task is enabled by this package.
Also protect Redis persistence, secrets and TLS/Caddy volumes; a Postgres-only dump is not a complete session-state backup.
Never run docker compose down -v, remove data volumes or reinitialize a populated database as a troubleshooting step.
If a generated password file is lost, generating a different one does not change passwords in an existing volume.

Use status and logs helper commands for diagnostics. Treat logs and backups as private.
Record backup age, storage use, certificate expiry, uptime and application errors in monitoring.
Container restart policies are not high availability or disaster recovery.

## 6. Updates and rollback

Before updates, take and verify a backup and retain current API/web images with a release tag.
Set MTX_RELEASE in deploy/.env to a unique release label before building.
Keep source commit, image IDs, configuration version and applied migration versions together in the release record.
For code-only rollback, restore the known-good API/web image tags and recreate only those services after checking schema compatibility.
Do not roll PostgreSQL backwards or automatically replay an old dump over newer writes.
After cutover writes, returning traffic to the old Render database would lose/diverge data; freeze writes, reconcile, and explicitly plan rollback.
Do not remove Render resources until destination acceptance and a current restore test are complete.

## Optional isolated GitHub container test

The workflow named MTX portable container check is manual-only (workflow_dispatch).
After pushing these source changes, run it from GitHub Actions. It does not use repository secrets or Render services.
It checks Node 22, images, Compose, private TLS startup, an unauthorized request, restart persistence and a restore into a separate temporary database.
All database records and credentials used there are disposable. It removes only its named CI containers/volumes.
A successful final marker is MTX_PORTABLE_CONTAINER_PASS_AND_CLEAN.
This workflow has not been run merely by adding its file. It does not verify public-domain TLS, real Telegram login or actual TON payments.

## Official references

- [Compose readiness dependencies](https://docs.docker.com/compose/how-tos/startup-order/)
- [Compose secret mounts](https://docs.docker.com/compose/how-tos/use-secrets/)
- [PostgreSQL 18 restore options and trusted-archive warning](https://www.postgresql.org/docs/18/app-pgrestore.html)
- [Caddy API + SPA routing patterns](https://caddyserver.com/docs/caddyfile/patterns)
