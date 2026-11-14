# Referral and Leaderboard design — 2026-11-14

User accepted Missions/Daily Reward and requested the next step. Referral and
Leaderboard now share the accepted navy/cyan/gold palette, home branding and
direct links to each other. Referral codes, statistics, inputs, disabled states,
copy feedback and error messages are styled for mobile. Leaderboard periods now
expose their selected state with aria-pressed; the current player is highlighted.

Referral generation, copy/accept handlers, fingerprints, rewards, ranking order,
polling, websocket behavior and backend code are unchanged. Scoped CSS resets
grid/padding inherited by virtual spacer elements, while preserving the existing
54px item height and all list virtualization calculations.

Verification uses synthetic accounts and intercepted requests only:

All 12 visual and 69 existing regression scenarios passed (81 total).

- 12 visual scenarios across EN/FA/AR, light/dark/system, 320–844px viewports,
  portrait/landscape, long codes/names and large balances. Includes keyboard
  focus, overflow, navigation targets, row geometry, period selection and scrolling
  to the last of 1000 players. No live referral or credit is created.
- Existing 24 activity and 45 reward/referral/inventory browser regressions.
- Frontend TypeScript, changed-file ESLint and production build.
- Persian Referral 320px and English Leaderboard 390px screenshots inspected.
  Fixed navigation in full-page captures remains at its viewport position;
  bottom-scroll assertions separately verify access to final content.
- Existing Wallet bundle-size warning is outside this change.

Local work only: Push, frontend Live and real-phone acceptance remain pending.
Check the two pages and copy the invite link after deployment; no new referral
account or purchase is needed solely to approve their appearance. Backup
automation remains paused. No hosting, database, credentials or payment settings
were changed.
