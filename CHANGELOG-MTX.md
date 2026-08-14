# MTX review and change report

## Selected base

`mini-tx-webapp-final-clean-with-earn-v6.3-tiered-recharge.zip` was selected. It contains the useful Earn and tiered-recharge work, and its React source builds successfully. The nominally newer v7 archive was not used as the base because `src/App.jsx` is syntactically broken (`useEffect` was inserted in the middle of the `useState` assignment) and contains repeated profile/referral/leaderboard effects. Its API patch also saves client-supplied score and upgrade values, which cannot be considered secure.

The plain `mini-tx-webapp-final-clean.zip` is the smallest baseline. Compared with it, v6.3 adds the Earn modal, boost levels/history, tap power, higher energy caps, tiered recharge, and associated styling.

## Changes applied

- Preserved the MTX identity and changed page metadata/title from the generic Mini TX name to MTX.
- Made Telegram WebApp initialization optional and safe, so the app also runs in a regular browser.
- Added versioned persistence for score, energy, capacity, tap/energy levels, tap power, and boost history.
- Validated and bounded restored browser data to avoid crashes and invalid/negative state.
- Made rapid taps consume energy through a synchronous reference, preventing stale event handlers from spending the same final energy more than once.
- Corrected the energy bar calculation to use the upgraded `maxEnergy`, clamp to 0–100%, and avoid division by zero.
- Added `.gitignore`, an environment example, and an explicit security-boundary document.
- Kept dependencies and the visual design small; no framework migration or high-risk rewrite was introduced.

## Important findings

### Critical / backend required

- All browser code, React state, localStorage, timers, and network requests can be modified or replayed by a user. Local score is demo data only.
- A real backend must validate Telegram `initData` using Telegram's documented HMAC flow and reject expired/replayed sessions. `initDataUnsafe` is display data, not authentication.
- Taps must be server-authoritative. The server should enforce energy, tap power, monotonic timing, burst/rate limits, request idempotency, and replay protection; it should return the resulting balance.
- Never expose an endpoint like the v7 `/api/me/save` that accepts score, energy, capacity, or upgrade levels from the browser as truth.
- Boost purchases must be an atomic server transaction: validate level and cost, debit once, upgrade once, and return the authoritative state.
- Earn claims and referrals require server-side proof, uniqueness constraints, anti-self-referral rules, idempotency, and abuse/rate controls. A client-side 12-second timer proves nothing.
- Wallet ownership and withdrawals require address validation, ownership proof where appropriate, an auditable ledger, signed server-side transactions, limits, and manual/risk review controls.

### High

- The v7 archive hard-codes one Worker URL and silently falls back to local scoring when an API tap fails. In production this converts an outage into a cheating path.
- v7 duplicates data-loading effects and could issue repeated referral registrations and overwrite fresh state with racing responses.
- The leaderboard in v6.3 is placeholder UI; weekly ranking and rewards require server snapshots and a defined reset timezone.
- Browser persistence has no cross-device synchronization and can be cleared or edited. It is retained only to make the demo pleasant.

### Medium

- The package has no automated test suite. Add backend contract/integration tests before connecting rewards.
- Accessibility can be improved by replacing clickable `div` elements with buttons, adding keyboard interaction, focus management, and reduced-motion support.
- Large inline JSX should eventually be split into Tap, Boost, Earn, and navigation components, but that refactor was intentionally left out of this low-risk patch.

## Verification

- Production build: passed with Vite 4.5.14 (31 modules transformed).
- Output generated in `dist/`; JavaScript bundle is about 154 kB uncompressed / 49 kB gzip.
- There is no test script in the supplied project, so no pre-existing automated tests could be run.

## Run

Use Node.js 18 or newer:

```sh
npm install
npm run dev
npm run build
```

Do not ship `node_modules`. Configure a backend origin only after the authoritative API described above exists; never put secrets in a `VITE_` variable because those values are public in the browser bundle.
