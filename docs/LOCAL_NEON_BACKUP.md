# Local encrypted Neon backup — preparation, 2026-11-13

## Actual state

The user selected laptop-only storage. The helper is implemented and tested with
synthetic data. **No live Neon backup has been made by this helper, credentials
have not been saved, and no recurring task was created or activated.**
The scheduling tool rejected creation (even paused) pending explicit daily-time
approval. The filesystem permission request did not grant writes to the target
folder. Do not bypass either restriction or use a different scheduler workaround.
Reconfirm the schedule and obtain the exact directory permission before setup.

Proposed time: daily 21:00 Asia/Tehran, subject to user approval. Use the app's
automation tool, not a raw Task Scheduler/cron workaround. Desktop scheduled
work needs this laptop, the app and network access available. A missed/offline
run is not a successful backup. Existing account usage limits still apply; this
does not provision a paid hosting/storage service or promise unlimited free runs.

## Storage and recovery limits

Default directory: `%LOCALAPPDATA%\MTX\Backups`, currently
`C:\Users\6365\AppData\Local\MTX\Backups`, outside the repository.
The script creates the new directory with inheritance disabled and grants only
the current Windows SID and SYSTEM access. It refuses a pre-existing directory
with broader permissions or a reparse point. It never silently repairs its ACL.

The connection password is a Windows DPAPI-protected PSCredential in
`connection.clixml`; it is prompted locally with hidden input. Never put the
password, this file, or an authenticated URL into chat, git or an automation
prompt. Setup is an explicit user step, not part of recurring execution.

Archives use DPAPI CurrentUser encryption (`.mtxdpapi`). They are **not portable
encrypted backups**: decryption relies on the Windows account/profile keys.
Losing the device/profile or reinstalling Windows can lose access. The user must
export a protected recovery copy before that happens. Administrators, malware,
or processes already running as the same Windows user are outside this threat
boundary. This is neither an off-device backup nor disaster-recovery completion.
Existing ordinary pgAdmin backups are untouched.

## Helper

Run `scripts/local-neon-backup.ps1` in PowerShell 7 (tested 7.6.9). The language
targets 5.1+, but the local Windows PowerShell 5.1 launch is blocked by its script
policy, so execution there is unverified. Do not change or bypass that policy.

- `-Mode Setup`: prompts for the current Neon role password locally, saves it
  under DPAPI, and snapshots trusted public Windows root certificates into PEM.
  This is not a successful connection test. Re-running replaces only setup files
  and is intended for an explicitly requested password/trust-store update.
- `-Mode Backup`: uses pinned PostgreSQL 18 executables and the established direct
  Neon host, `mtx_final_20261101`, `neondb_owner`. Credentials are passed only in
  the child process environment, not argv. Ambient `PG*` variables are removed.
  TLS requires `verify-full`, the saved Windows trust roots and channel binding.
  No insecure TLS fallback, migrations, restore or database writes are performed.
- `-Mode Verify -ArchivePath <encrypted-file>`: decrypts into a private unique
  work directory, reads the TOC and decodes the whole archive to NUL; no database
  connection occurs. Only a file directly inside the backup directory is accepted.
- `-Mode Export -ArchivePath <encrypted-file>`: explicit recovery operation only;
  validates then writes a unique **plaintext** `recovered-*.backup` into the private
  directory for pgAdmin/pg_restore. It does not restore anything. Only restore a
  trusted export into a newly created, empty, isolated destination; never overwrite
  live data. Securely protect/remove the plaintext export after the recovery drill.
- `-Mode SelfTest [-ArchivePath <synthetic-custom-archive>]`: tests encryption,
  byte-identical decryption, refusal to overwrite, tamper detection, private ACLs
  and refusal of a non-archive. With the optional file it also verifies the actual
  archive, roundtrips it and fully decodes the result. It never reads saved secrets.

Backup success requires: pg_dump exit 0, full archive decode, encrypted roundtrip
with identical SHA-256, and another complete decode. Only then is a unique
`.partial` renamed `.mtxdpapi`, with a non-secret hash/size/time JSON sidecar.
Partial files are never reported as success. Output/errors are allowlisted;
driver stderr and credentials are not printed. A file lock prevents simultaneous
runs. Connection timeout is 15 seconds; each subprocess is limited to five
minutes. Encryption has a 64 MiB per-archive memory guard; total stored files at
2 GiB stop new backups for review instead of automatically deleting old copies.
This is a bounded initial policy, not indefinite retention or a large-database
backup solution. A large dump can exceed the guard before the post-dump check.

Temporary plaintext is confined to the restricted unique work directory and
removed in finally on ordinary success/failure, using an exact allowlist and no
recursive deletion. Abrupt power loss/process termination may leave such a
directory; it remains private and needs explicit inspection/cleanup. Cleanup is
not secure erasure. Previously completed backups are never deleted by the helper.

## Verification actually completed

- PowerShell 7 self-test passed, including tamper/overwrite rejection and an
  invalid archive rejected by PostgreSQL tools.
- `scripts/test-daily-archive.mjs` passed on a fresh synthetic local PostgreSQL 18
  cluster: migration, atomic claims, duplicate/concurrent rejection, archive
  creation and restore to a second isolated database. Cluster was stopped.
- The resulting `daily-archive-Pe4L8v/synthetic.backup` then passed the helper's
  encryption/decryption SHA-256 comparison and full archive decode.
- Backup with no setup failed closed with `SETUP_REQUIRED`.
- No claims are made yet for live authentication, TLS compatibility with current
  Neon/network, scheduler operation, a fresh live snapshot, or live-data recovery.

## Activation gate

1. Obtain user approval for daily time and the private destination permissions.
2. Have the user enter their current password locally; never retrieve old exposed
   passwords from chat or inspect pgAdmin's saved secret store.
3. Run one real Backup. Stop on failure; do not weaken TLS or change the source.
4. Export that backup explicitly and rehearse restoration into a new isolated
   local database, checking schema/migrations/trigger and data consistency.
5. Only then create/activate the daily automation with the official tool. Its
   prompt may only run Backup and report success/failure; it must never Setup,
   Export, modify source files, change credentials, upload, deploy or delete.

References:
- https://www.postgresql.org/docs/18/libpq-ssl.html
- https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata
- https://learn.chatgpt.com/docs/automations
