# Notifications and read status — 2026-10-30

## Reviewed change set

Notification changes were already present as uncommitted work at the start of this review. They were preserved, inspected and tested. This pass extended the browser checks to cover an already-read inbox, expiry before clicking and the 99+ badge, and tightened notification-kind validation.

The page uses the existing account-scoped request controller: synchronous single-flight marking, disabled pending actions, late-response protection and GET-only recovery after an unknown mutation result. A successful mark response is validated and the inbox is fetched again instead of assuming every notification is read.

The bell is independently scoped to the account. Read-status changes trigger a refresh even if the mutation response was lost. In-flight reads are serialized; results started before a change event cannot restore an outdated badge. Old-account events are ignored. Polling/listeners are removed on unmount or expiry. A failed read hides an unknown badge instead of displaying an invented count.

Responses are checked for valid notification kinds, unique IDs, boolean read flags, finite timestamps and agreement between unreadCount and the returned rows. New notifications after the server read cutoff remain unread.

## Verification

- 254 Node tests passed with zero failures/skips, including notification model checks and the existing monotonic read-watermark test.
- 20 isolated notification UI scenarios passed. They cover ordinary and repeated clicks, persistence after reload, new notices, empty/already-read inboxes, 99+ count, load errors, duplicate IDs, network failure, accepted-but-lost response, refresh failure, malformed acknowledgement, expiry/account changes/unmount, stale bell responses, non-overlapping polling, read failure recovery and unrelated-account events.
- The browser harness intercepts all requests and uses synthetic users. No live notifications were marked, accounts changed, or database rows modified.
- Run with `pnpm test:notifications:ui`; optional Playwright/browser setup is documented in REWARD_ACCEPTANCE.md.
- Client/server type checks, changed-file lint and production build passed. The 23 activity checks and 45 reward/referral/inventory checks also passed: 88 browser scenarios total, zero failed.

## Existing server semantics and limits

No server or migration change is included. The read watermark is per-user and monotonic via SQL GREATEST. It marks notifications at or before the server's processing time, not only the rows visible when the button was clicked. The inbox and unread count are limited to the existing returned snapshot (up to 200 rows). Separate open tabs receive updated counts through their existing polling; the change event is local to the current window.

These tests do not audit production database contents or independently prove cross-device behavior. After reporting the revision Live, the user confirmed that Mark all read, the bell counter and persistence after reopening worked on the phone. This is user-reported acceptance.

## Phone acceptance after publishing

Open the bell and inspect existing notifications. If unread notifications exist, press Mark all read twice quickly. Confirm those notices become read and the badge is refreshed. Reopen MTX and confirm the read state persists. A genuinely new notice may remain unread; no need to create one, buy anything or reset records just for testing. If there are no unread notices, verify the empty/already-read state and leave the marking test pending.
