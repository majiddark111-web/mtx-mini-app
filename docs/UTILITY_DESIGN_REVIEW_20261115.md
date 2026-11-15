# Settings and Notifications design — 2026-11-15

The user accepted Wallet/History on their phone and requested the next step.
Settings and Notifications now use the accepted navy/cyan/gold design, with
a shared topbar linking the two pages and a small line-art notification icon.
Scoped styles cover settings cards, language/theme selection, toggles, visible
keyboard focus, notification read/unread states and empty/error messages.

Preference defaults, persistence, language/theme application, audio, vibration
and low-power handlers are unchanged. Notification fetching, mark-all requests,
account isolation, retries and the global notification bell are unchanged.
The branded page palette remains navy across theme preferences, consistent with
the previously accepted branded pages; the theme preference still saves and
applies through the existing preference service. No new timer, animation,
dependency or bitmap asset was added.

Verification uses isolated browser contexts and intercepted synthetic data:

- 15 design scenarios across EN/FA/AR, dark/light/system preferences,
  320–844px portrait/landscape/tablet widths, long messages, empty/error/guest
  states, wrapping and final content reachability above bottom navigation.
- Each Settings scenario exercises all languages/themes, keyboard toggles,
  focus visibility and persistence after reload. No preference request goes to
  a live server or changes the user's browser preferences.
- Notification visual scenarios check two unread items, mark-all acknowledgement
  and refreshed read state while retaining all five records.
- 20 existing notification regressions passed, including duplicate clicks,
  response loss, account changes, expiry, stale badge responses and refresh errors.
- Frontend TypeScript, changed-file ESLint and production build.
- English Settings 390px and Persian Notifications 320px screenshots inspected.
  Full-page screenshots show fixed navigation at its original viewport position;
  separate bottom-scroll assertions check access to final content.

The existing Wallet bundle-size warning is outside this styling change.
Push, frontend Live and phone acceptance are pending. After deployment, reopen
the miniapp, view Settings and Notifications, and check that one changed setting
survives reopening (restore it to the preferred value afterward). No purchase or
new reward claim is needed.

No live notification was marked read. No hosting, database, credentials, payment
configuration or backup automation was changed. The two existing modified
project/archive documents were not included in this work.
