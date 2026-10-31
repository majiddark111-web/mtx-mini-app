# Daily reward archive — local implementation, 2026-10-30

## Release gate: backup rehearsal passed on 2026-10-31

The configured backend runs migrations during its build. Pushing this change can therefore change the live database automatically. A fresh full backup of the intended MTX-New-Render database and a successful isolated restore of that fresh archive are required before commit/push/deployment. This change has not been applied to Render.

The October 30 Custom-format export of `mtx` (38,189 bytes, 74 TOC entries, SHA-256 `0576de26905012874953a19fb6a21d10339dbb80f5c607215da3c417cc9e8d67`) was restored transactionally into a new password-protected, loopback-only PostgreSQL 18 cluster. All 19 restored public tables matched the archive's COPY row counts. The release migration runner validated the five previous checksums, applied only 006, then applied nothing on rerun. All original application rows and the five previous migration records retained identical counts and content fingerprints. The new archive matched all three legacy claim rows (including date, streak, calculated reward and unknown exact time); its trigger was enabled. The cluster was stopped, its private temporary files removed and the original backup retained. This is a local rehearsal, not a comparison against later live writes or a live deploy.

The local file C:/Users/6365/Documents/mtx-after-confirmed-payment-20261027.backup was found and its archive table of contents read successfully (Custom format, database mtx, PostgreSQL 18.6, 74 TOC entries). Size: 37,823 bytes. SHA-256: CDD66C0B536BD2352D36F25B9283AFC1F4CCFC1A39C436187CAF1D08B3B13E48, matching the prior checkpoint. This is an October 27 backup, not a fresh October 30 snapshot. Its complete restore was not repeated in this task. Do not overwrite it.

## Data design

Additive migration 006 creates mtx_daily_reward_history with unique (user_id, claim_day), the credited reward, streak and nullable exact claim time. It copies only the latest claim actually present in the old per-user table. Imported rows keep claimed_at NULL because the original exact time was never recorded. No older daily claims or extra credit are fabricated.

A trigger archives every subsequent claim-day insert/update in the existing claim transaction. It also works with the previous API during a rolling deploy. A duplicate archived day aborts the whole transaction, preventing additional credit. A failed balance save rolls back the archive and latest-claim row. The migration locks the source table for copying and trigger installation, with a five-second lock timeout; failure aborts the migration rather than leaving an archive gap. Existing migration files are unchanged.

All later claims are retained in PostgreSQL. The recent-activity API displays the latest 100 daily records per user, consistent with other bounded history categories. This is not a paginated full-history export. Legacy rows explicitly expose dateOnly and render the UTC day without pretending midnight is an observed claim time. New rows show the database-recorded timestamp.

## Verification

- 256 Node tests passed, zero failures/skips.
- 89 isolated browser scenarios passed: activity 24, notifications 20, rewards/referral/inventory 45. The extra history case checks the date-only label.
- Client/server TypeScript, changed-file lint and production build were checked.
- scripts/test-daily-archive.mjs starts a new loopback-only PostgreSQL cluster with synthetic data. It accepts a PostgreSQL executable directory, never a database URL or production credentials. It applies migrations 001–005, seeds one legacy row, applies 006, tests duplicate claims, concurrent claim attempts, rollback after an injected balance-save failure, archived-day replay rollback, seven-day cap, skipped-day reset, user isolation and migration rerun.
- The script dumps/restores that synthetic database into a second fresh local database and verifies that the restored trigger still archives new rows. It stops its cluster and retains ignored synthetic artifacts.
- Initial attempts encountered Windows process-output inheritance and restricted loopback networking. The runner was corrected and local network permission obtained; the real PostgreSQL checks then passed. These failures are not counted as successful runs.

No live database, wallet, real balance or real daily claim was modified. Synthetic restore success is not proof that the latest production data has been backed up.

## Rollout after the backup gate

1. Make a fresh Custom-format export into a new filename; keep previous backups.
2. Restore it into a new isolated local database, check existing table counts/content fingerprints and rehearse migration 006. Verify copied daily rows and no changes to existing balance/state rows.
3. Only after this verification, commit and push. Confirm the backend log applies 006 successfully and both deployed versions match the intended commit.
4. Reopen MTX: known legacy daily claim should display date-only information. On the next legitimate claim day, verify one new history row and one credit. Verify the following legitimate day adds another row instead of replacing the first. Do not reset existing claims or alter the device/server clock to manufacture acceptance.
5. Take a post-release backup. Preserve the archive table and trigger on application rollback; do not drop them or restore old balances over newer payments.

## Remaining scope

Older unrecorded claims cannot be recovered from this schema alone. A general immutable ledger for every reward type, a paginated archive UI, production backup scheduling/off-device retention and real multi-day phone acceptance are separate tasks.
