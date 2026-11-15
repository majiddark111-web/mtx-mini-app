# Game modal polish — 2026-11-15

The user accepted Settings/Notifications and requested the next step.
The remaining Boost/Earn overlays used partially old styling and lacked
keyboard focus containment, Escape dismissal and focus restoration.

Changes:

- Scoped navy/cyan/gold modal styling, wrapping task cards, 48px actions,
  scrollable short-screen layout and a sticky Close header.
- Dialog name linked to the visible title.
- Focus starts on Close, Tab/Shift+Tab remain within the dialog, Escape closes,
  and closing restores focus to the connected opener.
- Background scrolling is locked while mounted. Event listeners and original
  root/body overflow styles are restored on close and route unmount.
- The close callback can update without reinitializing focus or scroll locking.
- Existing backdrop dismissal is retained. Existing Boost links and Earn
  external URLs, haptics, reward values, authentication and tap logic are untouched.
- Custom overlay remains below the existing session-expiry alert; no native
  top-layer dialog was introduced to cover that alert.

Verification:

- 12 isolated Boost/Earn scenarios across EN/FA/AR, 320–844px,
  portrait/landscape/tablet, light/dark/system and low-power preferences.
- Keyboard cycling, programmatic focus containment, Escape, Close, backdrop,
  focus preservation on parent rerender, cleanup on navigation/unmount and React
  Strict Mode. Both Boost destinations and all four Earn URLs are checked.
- External links are stubbed; no Telegram launch, purchase, reward claim or
  live API call occurs in these tests.
- Six existing Game/robot browser scenarios passed.
- Frontend TypeScript, changed-file ESLint and production build.
- Persian Earn at 320px and English Boost in landscape visually inspected.

The known Wallet chunk-size warning remains unrelated. This is not a complete
screen-reader or real-device accessibility audit. The new modal behavior still
needs frontend publication and phone acceptance: open Boost/Earn, scroll tasks,
close, and confirm the Game page can scroll again. No purchase is required.

Main player pages have received the theme pass. Remaining operational/security
items in PROJECT_STATUS_20261113.md are not cleared by this visual work; this does
not imply mainnet readiness or overall project completion. No live hosting,
database, payment setting or backup automation was changed.
