# Wallet and History design — 2026-11-14

After the user confirmed the Referral theme on their phone, Wallet and Activity
History were aligned with the accepted navy/cyan/gold design. A shared topbar
links the two pages. Payment recovery, unresolved order IDs, confirmation buttons,
transaction rows, history filters and activity cards now use scoped styles.
Wallet addresses retain left-to-right ordering in Persian/Arabic.

Payment creation, signing, confirmation, recovery, account checks, balances,
history parsing, filtering and sorting are unchanged. TON Connect's own controls
and modal are not restyled. No new dependency, image, animation or timer was added.
The stylesheet is shared by these two lazy-loaded pages.

Verification:

- 18 isolated visual scenarios: EN/FA/AR, dark/light/system preferences, 320–844px,
  portrait/landscape, long valid order IDs and wallet addresses, large amounts,
  long reward titles, empty/error/guest states, filter selection, disabled purchase
  controls, keyboard focus, wrapping and access to final content above navigation.
- Existing wallet retry regression: 3 languages; one conflict then successful
  verification after reload, preserved order, zero new orders or wallet sends.
- Existing activity regression: 24 scenarios covering history, account changes,
  late responses, expiry, filters/legacy dates and leaderboard behavior.
- Frontend TypeScript, changed-file ESLint and production build.
- Persian 320px Wallet and English 390px History screenshots inspected. Full-page
  captures place fixed navigation at its original viewport position; separate
  bottom-scroll assertions verify that final content remains reachable.

All browser requests were intercepted with synthetic data; wallet SDK hooks were
stubbed for the Wallet tests. These are not live blockchain or real-device tests.
The existing large Wallet bundle warning remains; this change does not address it.

Local implementation only. Push, frontend Live and phone acceptance are pending.
After deployment, reopen the miniapp and check Wallet and History appearance,
existing transactions and history filters. No new purchase is necessary.
No hosting, database, credentials, payment configuration or backup automation
was changed. The two pre-existing modified project/archive documents were left
untouched.
