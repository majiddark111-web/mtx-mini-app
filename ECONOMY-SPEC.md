# Lumos Economy Specification v1

## Currency flow

MTX is an in-game coin, not an on-chain token. Sources are accepted taps, offline profit, verified missions, and verified referrals. Daily credited taps are capped at 12,000; missions at 2,000 MTX; referrals at 3,000 MTX; offline income at three hours.

## Coin sinks

- Tap-power upgrade: cost `ceil(1,000 × 2.2^level)`, maximum level 25
- Energy upgrade: cost `ceil(750 × 1.9^level)`, maximum level 20
- Profit/hour upgrade: cost `ceil(2,000 × 2.35^level)`, maximum level 30
- Upgrade spending is fully burned. The future marketplace fee is 5%.

## Inflation controls

Profit/hour is linear through 100,000. Above that point only 35% of additional raw production becomes effective production, with an absolute effective cap of 250,000 MTX/hour. Reward caps and exponential sink costs prevent unlimited linear issuance.

## Expected daily gross income

| Stage | Assumptions | Gross income |
|---|---|---:|
| Starter | 2,000 taps × 1, 400 missions, 1 offline hour × 100 | 2,500 MTX |
| Active | 6,000 taps × 2, 1,200 missions, 500 referrals, 2 offline hours × 1,000 | 15,700 MTX |
| Power | 12,000 taps × 5, 2,000 missions, 1,500 referrals, 3 offline hours × 10,000 | 93,500 MTX |

All default values live in `economy/economyConfig.ts`; formulas live in `economy/economyService.ts`. Production can override the complete versioned document through the `ECONOMY_CONFIG` runtime binding, and authenticated clients can read `/api/economy/config`. Store and upgrade pricing must consume these functions rather than duplicate numbers.
