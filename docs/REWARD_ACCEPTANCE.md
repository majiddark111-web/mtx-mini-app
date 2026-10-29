# Reward acceptance and isolated UI regression checks

## Evidence recorded on 2026-10-29

- Render frontend and API deployment of `c6a428e` were directly observed as Live; `/healthz` returned `{"status":"ok"}` in the preceding verification.
- The owner reported that daily reward receipt, the expected balance increase, prevention of repeat collection and persistence after reopening all worked on the phone.
- The owner reported that the corresponding mission collection/reopen test also worked.
- These phone results are user-reported, not an independently observed device recording.
- A real-phone disconnect-during-claim test is **pending**: no unclaimed reward remains. Do not reset real reward records or change the device clock to manufacture eligibility.

## Repeatable local check

Run `pnpm test:rewards:ui` from the project. It uses the real reward pages and request hook, built in memory with Vite, with synthetic sessions and intercepted API responses. No server, database connection, Telegram login, wallet or production credential is needed. Service workers are blocked; all browser requests are intercepted, and requests outside the fixed loopback fixture origin are aborted.

Requirements: the project's Node 22 runtime and installed dependencies, plus an existing Playwright installation and a compatible browser. Playwright is optional developer tooling and is deliberately not added to the Render build or default test command.

If Playwright is available as `playwright`, no module override is needed. Otherwise set `PLAYWRIGHT_MODULE_PATH` to the absolute path of its installed JavaScript entry file. Set `REWARDS_BROWSER_PATH` to an existing Chrome/Chromium executable, or omit it to use Playwright's installed Chromium. Do not supply credentials or live API URLs.

The command exits nonzero on failure. The successful final marker is:

```text
MTX_REWARD_UI_PASS 19 isolated scenarios; no live API requests
```

The 19 scenarios passed locally on Node 22.23.3 with headless Chrome:

| Scenario | Daily reward | Missions |
| --- | --- | --- |
| Same-frame duplicate clicks send one claim | Pass | Pass |
| Network error exposes recovery; refresh does not replay claim | Pass | Pass |
| Server accepted but response lost; read-only recovery reflects claim | Pass | Pass |
| Claim succeeds but status refresh fails | Pass | Pass |
| Initial status load fails, then recovers | Pass | Pass |
| Expired session blocks claim | Pass | Pass |
| Late response after expiry is ignored | Pass | Pass |
| Old account response does not alter new account's UI | Pass | Pass |
| Response after unmount does not recreate page or claim again | Pass | Pass |
| Same-frame daily/combo/cipher actions share a single request lock | Pass | Not applicable |

## Limits and outstanding acceptance

The mock backend represents accepted/lost responses; this does not prove PostgreSQL transaction durability, production balance accounting, server-side authorization or behavior in Telegram's Android WebView. The unmount check detects visible regressions and page errors, not memory leaks. Existing backend tests and separate persistence verification remain necessary.

Once a legitimate new reward becomes available, repeat the phone network-error test. Confirm a visible error or recoverable pending state, reconnect and refresh status, and verify that the authoritative balance and claimed state agree without double credit. Do not label this pending phone check passed based only on these simulations.

No production application code, reward values, database records or deployment settings were changed by this test-tool addition.
