# Store and Inventory design — 2026-11-14

## Scope

User accepted the Profile design on their phone and requested the same visual
consistency for Store and Inventory. These two routes now use scoped navy/cyan/
gold styling, a Tokx Tap home link and a direct link to the other commerce page.

Cards, categories, filtering controls, prices, quantities, purchase history,
disabled buttons, loading/error messages and keyboard focus are coordinated.
Status messages remain in the page flow rather than covering mobile controls.
The branded palette remains readable with light/system preferences, as on the
accepted Home, Game and Profile pages. No assets, dependencies, timers or new
animations were added.

Purchase handlers, idempotency keys, inventory activation, skin selection,
request controllers, balance updates and all backend code are unchanged.
Only Store's existing result message gained a status landmark.

## Validation

- `scripts/test-commerce-design-ui.mjs`: 22 isolated Chromium scenarios covering
  both routes, EN/FA/AR, 320–844px widths, light/dark/system preferences,
  portrait/landscape, keyboard focus, no horizontal overflow, bottom-content
  reachability, empty/loading/guest/error/retry states and long values.
- Category filtering, inventory sorting, Store search/sorting, and disabled owned
  or unaffordable product buttons are checked. One mock Store purchase deducts
  exactly 100 MTX; one mock boost activation consumes one item and updates energy.
  No other scenario issues a mutation. All non-fixture traffic is blocked.
- All 22 commerce design scenarios passed. The existing browser regression suite
  also passed: 19 reward, 12 referral and 14 inventory scenarios (67 total).
- Frontend TypeScript, changed-file ESLint and production build passed.
- Persian Store 320px and English Inventory 390px screenshots inspected. Full-page
  screenshots place fixed navigation at its initial viewport position; separate
  assertions verify that the final content can scroll above the navigation.
- Existing large Wallet build chunk warning is outside this design-only change.

## Release status

This document records local implementation and isolated checks, not live device
acceptance. Push and frontend Live are still required. After release, check both
pages, filtering and scrolling on the phone. No new purchase or item consumption
is required merely to approve the appearance.

Profile was user-accepted before this change. Backup automation remains paused.
No hosting, database, credentials or real payments were modified.
