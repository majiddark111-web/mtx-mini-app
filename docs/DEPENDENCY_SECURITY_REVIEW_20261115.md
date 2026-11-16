# Bounded dependency security review — 2026-11-15

Baseline: `e2c405a`. This review concerns the Testnet MVP, not mainnet or
public-release approval. No production data, settings, wallet transaction,
push, or deployment is part of the work.

## Scope and evidence

The baseline registry audit reported 17 advisory/version findings: 10 high,
6 moderate, 1 low, zero critical. These are not 17 proven exploitable paths.

The verified local remediation retains the existing major versions:

- `react-router-dom` 6.30.4 to 6.30.6, with its matching router dependencies.
  The [upstream advisory](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2)
  identifies 6.30.6 as the patched 6.x version.
- Axios's `follow-redirects` 1.16.0 to 1.16.2, constrained with a scoped pnpm
  override. This remains within Axios 1.20.0's declared `^1.16.0` dependency.
  The [cross-realm header advisory](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)
  identifies 1.16.2 as patched; two other audit findings list 1.16.1.

No advisory exclusions, TLS bypass, supply-chain policy bypass, or automatic
major upgrade is allowed in this change.

## Application-path review

Source inspection found fixed application destinations in navigation arrays,
typed topbar destination unions, and literal admin redirect paths. No
user-supplied redirect destination was found in the inspected route call sites.
The entry point uses `ReactDOM.createRoot`, not server-side hydration. This
reduces the relevance of some redirect/SSR conditions but is not a security
clearance of React Router or every future application path.

Axios imports were found in the browser-facing API/admin clients and admin
error formatting, not in server source. Node-adapter redirect advisories must
not be described as demonstrated backend vulnerabilities on that evidence.

## Verification status

The lockfile-only retry completed with pnpm 11.25.0 on Node 22.23.3, with
supply-chain verification enabled and lifecycle scripts disabled. The first
observed attempt had failed with `ERR_PNPM_BROKEN_METADATA_JSON` after a registry
timeout; lower network concurrency (4) and a 120-second request timeout allowed
resolution to finish. The reviewed lockfile changes only the scoped override,
React Router DOM/React Router 6.30.6, Remix router 1.23.4, follow-redirects
1.16.2, and their references/integrity hashes. No unrelated versions changed.

Prepared lockfile SHA-256:
`31A794D9B5DACAC0E8C736D078EAFCC8A7CDFF6DA03152BA3E162B43AECF4781`.

The initial full frozen installation passed supply-chain verification but failed with
`ERR_PNPM_EPERM` at `symlinkAllModules`, creating the follow-redirects link
inside Axios's local virtual-store directory.
Direct module resolution after the failure found Axios 1.20.0 and Vite 6.4.6,
but React Router DOM and Axios's follow-redirects dependency returned
`MODULE_NOT_FOUND`. That incomplete installation was not used for verification.
The user subsequently ran the frozen installation in their normal PowerShell
session with an explicit project directory, resolving the installation blocker.

Completed local verification:

- Actual installed React Router DOM: 6.30.6. Axios-relative resolution and
  module loading confirmed follow-redirects 1.16.2. The lockfile hash above
  remained unchanged after installation.
- Node 22.23.3: 358 tests passed, 24 suites, zero failures, skips or cancellations.
- Frontend and server TypeScript checks both passed.
- Vite 6.4.6 production build passed, without a >500 kB chunk-size warning.
- Production bundle and Chromium Home-to-Wallet navigation passed. The payment
  encoder stayed out of both cold Home and the Wallet-opening path. No external
  requests were forwarded by the isolated browser harness.
- All 12 Boost/Earn dialog browser scenarios passed, including navigation and
  focus handling across the tested languages and viewport sizes.
- All 8 lazy-wallet scenarios passed using the real encoder with stubbed wallet
  and API, including load failure, expiry, account change, unmount and replay.
- Wallet retry passed in English, Persian and Arabic: two checks each, zero new
  orders and zero wallet sends.
- Tap retry passed: reload/reconnect/timer respected HTTP 429, the lost reply
  retried the original batch, and two taps were credited only once each.
- `git diff --check` passed. The two pre-existing dirty documents were preserved.

The follow-up registry audit reported 13 findings: 7 high, 5 moderate, 1 low,
zero critical, down from 17. It no longer reported the React Router DOM advisory
or the three follow-redirects advisories targeted here. The remaining React
Router findings concern the separate `react-router` package. This count is
advisory/version matching, not an application security certification.

No application payment logic, deployed service, live database or live wallet
was changed. This limited patch is ready for a local commit and user-controlled
push. Deployment and a phone smoke test are still required; they were not
performed by these local tests.

## Remaining work

React Router findings with fixes listed only in major version 7 require a
separate migration assessment. The [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
lists no patch; it remains explicit rather than suppressed. Development-tree
findings involving nanoid, js-yaml, brace-expansion, source-map-js and minimatch
also remain outside this narrow update. No findings were suppressed.

The approximate 96% Testnet MVP progress estimate is qualitative, not a
completed-ticket metric or a security certification. Operational backup,
security and measured load/performance gates remain separate from UI acceptance.
