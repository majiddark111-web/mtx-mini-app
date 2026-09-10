# Period activity accounting

## Missions

- Daily: 500 server-accepted taps in the current UTC day; reward 300 MTX.
- Weekly: 10,000 MTX earned from accepted taps and credited offline income in the current UTC week; reward 1,000 MTX. Weeks begin Monday at 00:00 UTC.
- Monthly: gain 10 player levels in the current UTC calendar month; reward 2,000 MTX. An existing level 10 does not complete the mission in every future month.
- Spending does not subtract from earned-income progress. Purchased coins, daily rewards, mission rewards, challenges and referral rewards do not count as gameplay income.
- Offline income is counted when credited by the server, within its existing cap. It is not retroactively distributed over the absence interval.

## Persistence and rollout

The optional `activity` field in the existing game-state JSON stores the current day, week, month and calendar quarter counters. The engine updates these in the same state as coins and XP; the existing PostgreSQL state persistence saves them together. No SQL schema migration is required.

Existing states without this field start with zero tracked progress. Existing balances, XP, levels and unique mission-claim records remain unchanged. A previously claimed mission cannot be claimed again in the same period. Historical lifetime XP or balances are not guessed into period counters. New period counters begin at rollout; there is no automatic backfill.

The local runner's claim history is in memory. Restart-safe claims require the production PostgreSQL social persistence adapter. Local tests use isolated repository/adapter doubles, not the deployed Render database.

For staging verification, make a few valid taps, inspect mission progress, close/reopen the Mini App and verify it is unchanged. Check a normal purchase does not reduce weekly earned progress. Calendar rollover and duplicate claims are simulated by automated tests; do not change the production server clock to test them.
