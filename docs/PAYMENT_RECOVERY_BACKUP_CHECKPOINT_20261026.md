# Pre-deployment backup checkpoint — 2026-10-26

## Completed

- Created a full Custom-format pgAdmin backup of database mtx on the saved
  MTX-New-Render connection. The UI reported Process completed.
- Stored the new archive at
  deploy/backups/mtx-before-payment-recovery-20261026.backup.
  No existing archive was overwritten. This directory is excluded from Git.
- Archive size: 34,963 bytes. Archive metadata: database mtx, Custom format,
  pg_dump/server version 18.6, 69 table-of-contents entries.
- SHA-256: 45AECC831AD5D94E1150C12FCE6F07182D67092B3B69D0DC8FB1202CBAB84133.
- Restored the archive with pg_restore --single-transaction --exit-on-error
  into a new database mtx_backup_verify_20261026 on the disposable local
  PostgreSQL cluster created for payment tests (127.0.0.1:55439).
  The existing user PostgreSQL service/databases were not used or changed.
- Restore used --no-owner --no-acl to avoid importing Render-specific roles.
  This drill verifies schema/data restoration, not original role/ACL restoration.
- Compared row counts extracted from all 18 COPY sections in the archive
  against restored tables, plus the total public-table count: 19 checks passed.
  This is an archive-to-restored-copy comparison, not a separate snapshot of
  the live source. No raw user/payment records were printed.
- Applied migration 005 using the migration runner on the restored local copy.
  It created an empty mtx_payment_intents table. Existing data-table row counts
  were unchanged; the schema-migration ledger gained its expected entry.
  Running the migration runner again applied nothing.
- Stopped the disposable PostgreSQL server after the drill. The local copy
  remains available for controlled reuse; it contains application data and must
  not be published or shared.

## Remaining deployment gates

No commit, push, Render deployment, production migration, plan change, credential
change, or blockchain payment was performed in this step.

Before publication, inspect the actual backend Build Command and frontend
auto-deploy behavior. Ensure migration 005 runs before starting the new API and
deploy the backend before the frontend. The previous API does not implement
GET /api/wallet/payments/intents.

After rollout, run the real-phone Testnet recovery test described in
PAYMENT_RECOVERY.md. Local tests and a successful restore do not replace it.

Keep a second protected copy of the backup outside this laptop before relying
on it as disaster recovery. No external upload or encrypted second copy has
been made by this task.
