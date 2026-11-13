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

The initial design (7212931) was deployed and the user confirmed the functional
Telegram checks. Their phone screenshot showed that the viewport-height-limited
stage made the artwork too narrow and the foreground coin disproportionately big.

The follow-up uses the artwork's native aspect ratio for the stage, allowing the
image to fill its width without cropping the head. The coin is 40% of stage width,
positioned near the feet, leaving the face and upper body visible. Short screens
scroll naturally to energy/actions; navigation remains fixed. No new asset,
animation, timer, or gameplay change is introduced.
All six browser scenarios pass after this adjustment, with new assertions for
painted image width, coin proportion, and face/upper-body clearance. This framing
follow-up was published as 546d020. On November 13 the user confirmed Live and
accepted the enlarged artwork on their actual Telegram phone.

## Home visual follow-up — local, 2026-11-13

Home now reuses the optimized robot art, navy/cyan/gold palette and SVG icon
language. Its real balance subscription, Play link and six feature destinations
are retained. Testnet remains explicitly labelled; no asset dependency, timer,
API request, wallet operation or backend change is added.
The scoped Home styling does not restyle payment, admin or other feature pages.
The branded Home surface remains navy in all theme modes, like Game.

Run scripts/test-robot-design-ui.mjs --home for six isolated viewport/language/
theme scenarios: WebP decode, displayed balance, six shortcuts, Play navigation,
active Home navigation, keyboard focus, text color and horizontal overflow.
These use synthetic balances and intercept all requests. The production bundle
and Chromium Home-to-Wallet test passed; TON Connect remains excluded from cold
Home. Frontend TypeScript and changed-code ESLint also passed. This new Home
design still needs deployment and real Telegram acceptance.
