# Portable MTX verification — 2026-09-19

## Implemented in this delivery

- Portable API and frontend images; same-origin reverse proxy and generated TON Connect manifest.
- Existing game, economy, languages, admin, persistence and migrations retained.
- Managed-infrastructure and self-hosted PostgreSQL 18 + Redis configurations.
- Private TLS, verified certificates, non-superuser database account, separate secret files and JWT keys.
- Persistent volumes, health dependencies, bounded logs, graceful API shutdown.
- One-time configuration initializer that refuses to overwrite existing credentials.
- Unique backup archives with readability checks/checksums; restore guardrails for an empty stopped destination.
- Persian introduction, operator installation/cutover/rollback runbook.
- Manual-only isolated GitHub container workflow; not executed by adding it.

## Checks actually executed locally

| Check | Result |
| --- | --- |
| Existing baseline check/lint/tests/build | Passed before changes |
| TypeScript frontend + server | Passed |
| ESLint | Passed, zero warnings |
| Node tests | 169 passed, 0 failed, 0 skipped |
| New portable tests | 13 passed (configuration and structural safeguards) |
| Vite production build | Passed |
| Both Compose YAML files | Parsed successfully |
| Manual workflow YAML | Parsed successfully |
| Git whitespace check | Passed |

Local runtime: Node.js 24.19.0, pnpm 11.19.0.
The repository's supported production engine is Node.js 22; local checks therefore emitted the existing engine-range warning.
Portable images target Node.js 22 and pin pnpm 10.34.5. The dedicated GitHub workflow will check that combination.
YAML parsing and textual safeguard assertions are NOT Docker engine or shell execution tests.

## Not executed / not yet accepted

Docker and Bash are not installed in this local environment. Container builds/startup, Linux ownership, private TLS handshakes and container backup/restore have NOT been proven here.
The manual GitHub workflow has NOT been run or pushed by this task.
No new server, public HTTPS certificate, DNS, Telegram URL, real login/payment or destination load test was configured or exercised.
No managed provider was selected, no automatic off-server backup destination was configured, and Redis data migration is not automated.
Existing September-16 backup restore evidence remains a prior independent test, not proof of a new-server restore.
Do not describe this delivery as fully production-certified or a completed data migration.

## Data and compatibility

No Render service/database was deleted, altered or upgraded by this work.
No real backup, secret or user database is included in the source package.
Only the original Testnet TON payment mode is supported.
A new Redis requires renewed player/admin sessions and an explicit TOTP reset or verified migration of consumed-code state.
Rankings/session state must be checked at cutover; this delivery does not promise exact Redis-state preservation.
Mainnet enablement, final capacity, monitoring, automatic off-server backup and production acceptance remain separate gates.
