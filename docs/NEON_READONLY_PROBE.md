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
- Checks TLS, role/database/PostgreSQL 18, read-only transaction status, all six migration names/checksums, 20 public tables, reward-history presence and enabled archive trigger.
- Output is a fixed summary or allowlisted failure category; no credential, user ID, wallet address or balance is logged.
- The earlier 20-table content-fingerprint match remains separate evidence. This probe does not repeat it, test writes, prove production capacity, or include newer activity on Render.

No Render environment variable or Start Command was changed when adding these files. No live probe has run yet. Final migration still requires pausing all writes, taking a fresh backup and restoring it to a separate empty final destination before switching the application.
