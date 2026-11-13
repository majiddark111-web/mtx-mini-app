# Robot game design — local preview

Reference: the user's approved blue/gold Tokx Tap mockup and original robot art.
The original PNG is copied unchanged to public/mtx-robot-scene.png (2,361,047 bytes).
The picture element prefers mtx-robot-scene.webp (252,714 bytes, 89.3% smaller),
with the original PNG as the format fallback. Encoding preserves dimensions and
composition; scripts/encode-robot-art.mjs reproduces the WebP using Chromium.
The screenshot itself is not used as an interactive interface.

Implemented: real player/balance/energy values, existing tap handler, CSS MTX coin,
Aurora appearance, settings link, Boost/Earn actions, and six SVG navigation icons.
The game now includes the shared bottom navigation. Diagnostics remain accessible
below the actions. The scene is decorative, static, and cannot intercept taps.
Reduced-motion and existing low-power settings are respected; no animation loop
or new timer is added. Payment, session and tap synchronization logic is unchanged.

Verification uses synthetic local data, not a live account or payment:
scripts/test-robot-design-ui.mjs checks English/Persian/Arabic at 320/390/430/768px
and 844px landscape, in dark/light/system themes and low-power modes.
Checks include horizontal overflow, WebP loading, keyboard focus visibility,
opening/closing Boost and Earn, expanded diagnostics and all six navigation links.
Screenshots are in .build-verification/robot-preview (ignored by Git).
The lost-reply and HTTP-500 tap retry browser tests passed after the changes.
The 358-test Node suite, frontend/server TypeScript checks, scoped ESLint and
production build passed. Wallet retry passed in three languages without creating
orders or sending payment. Startup bundle/Chromium navigation tests passed: the
wallet SDK remains excluded from cold Home. The pre-existing large Wallet bundle
warning remains, unrelated to the robot scene.

This is locally implemented and verified, not deployed. The decorative art now
uses contain framing to avoid cropping the head and obscuring the face with the
tap target. Existing tap/session/payment logic is unchanged.
Before publication, review the final screenshots and perform an actual Telegram
device check after deployment. The reviewed design is recorded in a dedicated
local commit; push and deployment are separate release steps.
