# Lumos Phase 5 — Store, Inventory, Wallet

## Delivered

- Authenticated catalog generated from the Phase 4 economy configuration
- Store categories, search, sorting, featured/limited states, owned state, and secure buy action
- Server-authoritative coin deduction and upgrade application
- Idempotency key per purchase; replay returns the original result without charging again
- Inventory for skins, boosts, and consumables with filters, sorting, quantity, and purchase history
- Wallet transaction history with pending, confirmed, failed, and refunded presentation states
- Server-side payment-verifier binding for TON/USDT
- Transaction-ID idempotency; replayed confirmation is neither reverified nor double-credited
- PostgreSQL schema for inventory, purchases, and payments
- TON Connect adapter boundary and public manifest template
- NFT support explicitly disabled behind an extension point

## Verification

- Frontend and backend TypeScript: passed
- ESLint: passed
- Tests: 25 passed
- Purchase replay test: one debit and one upgrade only
- Payment replay test: one verifier call and one 500 MTX credit only
- Production build: passed; 141 modules, 281.95 kB JavaScript / 94.22 kB gzip

## Required before real-money launch

- Replace all `play.example.com` values in `public/tonconnect-manifest.json` with the final HTTPS Lumos domain and real policy URLs.
- Register a real TON Connect SDK adapter through `configureTonConnect`; the current UI intentionally disables the connect button.
- Provide a `PAYMENT_VERIFIER` implementation that checks TON/USDT transactions against the chain or trusted provider, validates destination, amount, finality, and memo/user binding.
- Wire commerce persistence methods to the PostgreSQL tables. The current repository provides the schema and secure flow tests, while its runtime commerce adapter remains in-memory.
- Add refund webhook authentication and explicit confirmed-to-refunded transition handling before accepting money.

Phase 5 purchase DoD is met for the server-authoritative coin economy and replay protection. Real-money acceptance is deliberately blocked until the external configuration above exists.
