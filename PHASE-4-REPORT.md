# MTX Phase 4 — Economy Balance

## Delivered

- One tunable economy source in `economy/economyConfig.ts`
- Versioned `ECONOMY_CONFIG` runtime binding and authenticated config endpoint for tuning without redeployment
- Shared pricing and income formulas in `economy/economyService.ts`
- Exponential tap, energy, and profit/hour upgrade costs
- Full upgrade-cost burn and a configurable future marketplace fee
- Daily caps for credited taps, missions, referrals, and offline income
- Diminishing returns above 100,000 raw profit/hour and a 250,000 effective hard cap
- Three daily-income scenarios documented in `ECONOMY-SPEC.md`
- Existing Boost quotes and server offline profit now consume the shared economy configuration

## Daily gross-income targets

- Starter: 2,500 MTX
- Active: 15,700 MTX
- Power: 93,500 MTX

These are gross issuance targets before upgrade spending. Store prices in Phase 5 must call `upgradeQuote` and must not duplicate price numbers.

## Verification

- Frontend TypeScript: passed
- Backend TypeScript: passed
- ESLint: passed
- Tests: 23 passed, including six economy tests
- Production build: passed; 136 modules, 275.44 kB JavaScript / 92.56 kB gzip

## Phase boundary

Phase 4 defines and verifies balance formulas. Authenticated server-side purchase transactions, inventory delivery, payment idempotency, and real store UI belong to Phase 5. Production should back the runtime binding with an admin-controlled KV/config service and publish only complete documents that pass the server validator.
