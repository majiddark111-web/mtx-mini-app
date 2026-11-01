# Opt-in runtime connectivity probe — 2026-11-01

This is not a database cutover. The script is not imported by the API, build or migration runner. Normal deploys do not execute it. The existing DATABASE_URL / POSTGRES_URL and Redis settings remain unchanged.

## Pending execution on Render

Local unit tests do not prove connectivity from Render. After this commit is deployed, the owner must put the direct Neon URL into the backend-only secret environment variable MTX_NEON_PROBE_URL. Never put it in VITE_* variables, Git, a command argument, frontend settings or chat. Adding this credential to Render requires the owner's explicit approval. Do not copy/replace the active DATABASE_URL.

For a one-off runtime check, first record the exact current Start Command and confirm the intended backend service is mtx-api-test. Do not change the Build Command or health check. With approval, the temporary Start Command for this project's currently documented native Node entry point is:

    node server/checkNeonReadOnly.mjs && exec node --experimental-strip-types server/productionServer.mjs

The check runs on the new runtime instance, not a build instance. If it fails, the new process exits without starting the API; inspect the failure and restore the original Start Command, not the active DB URL. Do not treat deployment acceptance as success. Verify MTX_NEON_READONLY_PASS and then the new deploy's Live status and the existing API health. Render rollout behavior: https://render.com/docs/deploys and https://render.com/docs/health-checks

After collecting the result, restore the recorded Start Command, remove only MTX_NEON_PROBE_URL, redeploy and verify Live/health again so later restarts do not repeat the check. The current original command is reported as node --experimental-strip-types server/productionServer.mjs, but must be inspected again before mutation. Save-only environment changes are not live until deploy: https://render.com/docs/configure-environment-variables

## Safety / scope

- Only the user-confirmed Neon direct host, port 5432, neondb and neondb_owner are accepted. No fallback to other credentials.
- URL query parameters cannot weaken TLS or pass arbitrary PostgreSQL options. Explicit certificate/hostname verification and channel-binding support are enabled in the dedicated pg client.
- One client, one read-only transaction, no retry loop, no Redis, no migration, no DDL and no payment/claim calls. Connection/query timeouts and a 45-second process deadline bound the command.
- Checks the actual Node pg client-to-Neon socket for encryption, CA authorization, hostname match and TLS 1.2 or 1.3. `pg_stat_ssl` is not used as proof of this hop: Neon terminates client TLS at its proxy. Missing socket evidence fails closed with `NEON_PROBE_TLS`; certificate validation is never disabled.
- Checks role/database/PostgreSQL 18, read-only transaction status, all six migration names/checksums, 20 public tables, reward-history presence and enabled archive trigger.
- Output is a fixed summary or allowlisted failure category; no credential, user ID, wallet address or balance is logged.
- The earlier 20-table content-fingerprint match remains separate evidence. This probe does not repeat it, test writes, prove production capacity, or include newer activity on Render.

## Reported runtime result and TLS correction — 2026-11-01

The owner supplied a Render probe failure `NEON_PROBE_IDENTITY`, followed by a separate pgAdmin read-only result `neondb / neondb_owner / 180006 / backend_ssl=false`. The earlier probe incorrectly required `pg_stat_ssl.ssl=true`, which describes the backend connection rather than the client's TLS connection through Neon's proxy. The corrected check uses pg's Node TLSSocket after connect and retains strict certificate and hostname validation. Reference: https://nodejs.org/docs/latest-v22.x/api/tls.html#tlssocketauthorized and https://github.com/neondatabase/neon/blob/main/proxy/README.md

This code correction does not change remote settings. A successful corrected Render probe is still pending; the pgAdmin result alone is not a full probe PASS. A credential shared in chat must be rotated privately and the probe variable updated; never copy the exposed credential into code, tests, logs or documentation.

Local Node 22 verification: 24 probe unit tests pass, including proxy backend `ssl=false`, authorized TLS 1.2/1.3, wrong hostname, untrusted/plaintext/missing socket evidence, and unchanged identity/read-only/schema checks. The complete project unit suite passes 280 tests with zero failures/skips. These fixture-based tests do not substitute for a live Render-to-Neon probe.

Final migration still requires pausing all writes, taking a fresh backup and restoring it to a separate empty final destination before switching the application.
