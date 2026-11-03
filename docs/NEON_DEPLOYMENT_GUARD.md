# Neon deployment guard after cutover

The post-cutover backup was restored successfully to a separate local PostgreSQL
18 database. The runtime no longer needs the one-time cutover checks for exactly
20 tables or the presence of historical reward examples.

`server/checkNeonFinalReadOnly.mjs` remains the entry point, so the existing Start
Command still works. It only opens a read-only PostgreSQL connection; it does not
run migrations, contact Redis, or start the application.

## Two phases

- `--before-migrate`: require the established baseline (migrations 001–006),
  with applied migrations forming an unchanged prefix of this release. New,
  appended migrations may still be pending. Empty, incomplete-baseline,
  modified, out-of-order, or newer-than-code histories fail closed.
- No arguments: startup check. All migrations shipped with the release must
  already be applied, with matching version, filename and checksum. Pending
  migrations block startup. Unknown CLI arguments also fail closed.

Both phases retain the pinned direct Neon hostname, final database
`mtx_final_20261101`, role `neondb_owner`, PostgreSQL 18, `sslmode=verify-full`,
certificate/hostname verification on the actual client TLS socket and a read-only
transaction. Disabling either PostgreSQL TLS setting is rejected. Error logs
contain allowlisted codes rather than credentials or driver error details.

All 20 established application tables and the enabled daily reward archive trigger
must remain present. Extra tables are allowed. No user balances or reward-row
counts are part of this availability gate. A future migration that intentionally
removes or renames an established table/trigger must update the guard in the same
reviewed release; this is not a generic bootstrap tool for a new database.

The historical `probeFinalNeon` / `probeNeon` functions retain their stricter
one-time backup/cutover behavior; the deployment CLI uses `probeNeonDeployment`.

## Apply on the existing Render API only

1. Commit and push the guard code and tests. Do not use these new arguments with
   the old code. This release adds no SQL migration or dependency.
2. For **mtx-api-test** (not the static frontend), set Build Command to:

   ```sh
   pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm build && node server/checkNeonFinalReadOnly.mjs --before-migrate && node server/migrate.mjs
   ```

3. Leave Start Command unchanged:

   ```sh
   node server/checkNeonFinalReadOnly.mjs && exec node --experimental-strip-types server/productionServer.mjs
   ```

4. Do not change DATABASE_URL, passwords, TLS flags, the plan, frontend, Redis or
   Auto-Deploy. Deploy the reviewed commit through the usual manual workflow.
5. Expect `MTX_NEON_FINAL_PASS` with `phase: "before-migrate"` in Build. Its
   `pendingMigrations` may be positive before an additive migration. The existing
   migration runner then applies migrations in its locked transaction.
6. Expect `MTX_NEON_FINAL_PASS` with `phase: "startup"` and
   `pendingMigrations: 0` before the API starts. Verify Live, `/healthz`, existing
   balance/history and persistence through one controlled app operation.

Current six-migration release: both phases should report `migrations: 6` and
`pendingMigrations: 0`. `readonly: true` describes only the diagnostic session,
not the application's write permissions.

## Rollback and verification limits

- A successful local unit suite is not evidence that the new commit is live.
  Record the deployed commit and both phase results separately.
- After new migrations or writes on Neon, do not switch DATABASE_URL back to the
  old Render database. An older application release is deliberately rejected if
  the database contains migrations absent from that release. Coordinate a forward
  fix or a reviewed recovery instead of bypassing the gate.
- Keep the verified backup and the old read-only source. This gate verifies schema
  history and core structure, not complete business-data integrity or backups.
