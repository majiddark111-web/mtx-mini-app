# Inventory UI safety — 2026-10-30

## Scope

Inventory uses the existing account-scoped request controller to load server inventory and serialize actions on the mounted page. A synchronous lock blocks same-frame double clicks and competing item/skin actions, including switching back to the default skin. Actions are disabled during loading, mutation and recovery, and for zero-quantity entries.

Pending tap batches are synchronized before a consumable is activated. Session/account/lifecycle checks run after asynchronous boundaries and inside the queued tap operation. Failed tap synchronization does not proceed to consumption. Late mutation responses cannot update global game state or skin after expiry, account change or unmount.

An unknown mutation outcome hides stale inventory and offers a GET-only refresh; it never automatically repeats consumption. A successful action also reloads inventory. English, Persian and Arabic recovery messages are included. No backend rules, quantities, prices, database schema or deployment settings were changed.

This is a mounted-page UI guard, not a server idempotency guarantee. Concurrent tabs/devices, or leaving and reopening while a mutation is still executing, require separate backend coordination. A failed activation response can leave the energy display stale until the game state is next fetched; inventory refresh itself does not overwrite optimistic pending tap state. Neither automatic replay nor manual inventory corrections are used.

## Local verification

`pnpm test:rewards:ui` includes 14 inventory scenarios, using synthetic sessions and fully intercepted requests:

- Same-frame double activation and competing actions: only one mutation.
- Default-skin selection: every action stays disabled while pending.
- Network failure, accepted-but-lost response and post-success refresh failure: GET-only recovery.
- Initial read failure and recovery.
- Expired login, late response, account switch and unmount: no stale game-state update.
- Pending taps sent before activation; tap failure or expiry during synchronization blocks activation and retains unacknowledged taps.

All 14 inventory checks, 12 referral checks and 19 reward checks passed. The existing 246 Node tests passed with no failures or skips. No live account, wallet, inventory or database mutation was performed by these tests.

## Phone acceptance

Before this change, the user reported that ordinary boost activation worked, quantity decreased by one and the result persisted after reopening. This is user-reported baseline evidence, not acceptance of the new version.

After publishing this change, with an existing test consumable and energy below maximum: tap Use twice quickly, verify only one item is consumed and the result persists after reopening. If an outcome is uncertain, use Refresh inventory rather than repeatedly pressing Use. Do not buy or reset items solely to pass a test. Network-loss behavior on a real Telegram WebView remains pending phone acceptance.
