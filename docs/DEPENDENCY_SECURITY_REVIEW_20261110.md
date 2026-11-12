# Dependency advisory review — 2026-11-10

Baseline: commit `881622a`. This is dependency triage, not evidence of a
compromise or a complete application security audit. No live probing, wallet
transaction, database write, push or deployment is part of this review.

## Current outcome — verified locally on 2026-11-12

The user completed the frozen-lockfile installation with pnpm 11.25.0 in their
normal PowerShell session. Direct local package resolution now confirms Axios
1.20.0 and Vite 6.4.6. The limited update is locally verified; this is not a
clearance of all dependency findings or approval for mainnet/public release.
This update is being recorded as a local commit; no push or deployment is part
of this verification.

The earlier blocked installation entries below are historical. The final
verification results and remaining findings are recorded at the end.

## Baseline findings

`pnpm audit --json` reported 34 findings: 18 high, 14 moderate, 2 low, zero
critical in that registry response. These are advisory/version matches, not
34 confirmed exploitable application paths; some entries refer to multiple
versions or development-only dependency paths.

The baseline lockfile resolved Axios 1.19.0 and Vite 6.4.3. Source imports Axios in the
browser-facing player/admin clients and admin error formatting; no server-side
Axios import was found. Individual Node adapter advisories therefore cannot
automatically be treated as exploitable backend paths. Browser/prototype
issues still warrant upgrading the dependency.

Vite is a development/build dependency. The checked configuration does not
explicitly expose its dev server through `server.host`; production uses the
Node API and static build rather than `vite dev`. Runtime command-line overrides
and active external listeners were not independently inventoried.

## Verified upstream references and limited remediation scope

- [Vite GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7):
  published November 10; includes Vite through 6.4.5 and lists 6.4.6 as the
  patched 6.x version. Its stated condition is a dev server exposed to the
  network. This critical advisory was not present in the registry audit
  response above; the registry count alone is not a complete clearance.
- [Axios GHSA-r4gj-5m52-g5wh](https://github.com/axios/axios/security/advisories/GHSA-r4gj-5m52-g5wh):
  patched in 1.20.0. The redirect bypass requires the fetch adapter and an
  application relying on maxRedirects; no unconditional SSRF claim is made.
  The audit also reports other Axios advisories fixed at 1.20.0.

The bounded proposed update is Axios 1.20.0 and Vite 6.4.6, retaining their
current major versions. Both versions were confirmed available from the
package registry. Installation, resolved lockfile and test verification must
all succeed before treating this as completed remediation.

## Explicitly remaining findings

- React Router 6.30.4: redirect/SSR-related advisory matches, including reports
  whose stated fix is in major version 7. Do not silently force a major upgrade;
  review actual route inputs and SSR usage, then test a separate migration.
- deepmerge 4.3.1 through TonConnect: the
  [reviewed advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
  lists no patched version. Do not suppress the finding or invent a safe version;
  follow upstream and assess how the SDK passes external data to merge operations.
- Development/transitive findings include nanoid, source-map-js, js-yaml,
  brace-expansion and minimatch. follow-redirects is also flagged beneath Axios.
  Re-audit after the bounded update; do not assume a direct dependency upgrade
  has cleared every transitive finding.

The report does not approve mainnet use or public release. No audit exclusions
or automatic major-version fixes were added. Pre-existing dirty project-status
and daily-reward documents are outside this work.

## Initial installation attempt — historical, superseded below

The temporary manifest edits were NOT retained. pnpm 11.25.0 installation
encountered registry metadata timeouts (`ERR_PNPM_BROKEN_METADATA_JSON`) and
an internal error while reporting the timeout. Supply-chain verification had
passed on one attempt; no policy was disabled to bypass it. A bounded retry
using Node 22, a longer fetch timeout and lower requested network concurrency
continued to receive timeouts and was cancelled. Lifecycle scripts were disabled
for these install attempts.

The two manifest lines were restored to their exact prior contents. The
lockfile was not changed, and direct package checks still showed Axios 1.19.0
and Vite 6.4.3. Consequently no patched-build or regression success is claimed.
Only this report is new; neither a commit nor a push/deploy was performed.

Next action: restore reliable access to registry.npmjs.org, retry the bounded
update, inspect the lockfile diff, run the full Node 22 suite/type checks/build
and relevant browser scenarios, and audit again. Keep the remaining findings
explicit; do not treat this assessment or past functional tests as remediation.

## Intermediate attempt — lockfile prepared, installation still blocked

The bounded manifest edits have now been reapplied: Axios is pinned to 1.20.0
and Vite to 6.4.6. A pnpm 11.25.0 lockfile-only operation completed successfully
on Node 22.23.3, with supply-chain policies enabled and lifecycle scripts disabled.
The reviewed lockfile diff changes those two versions, their integrity hashes,
and the existing React plugin's Vite peer reference; no unrelated package
versions or major versions were changed. The lockfile remains version 9.

Full installation failed twice while creating the React plugin's internal Babel
link (`ERR_PNPM_EPERM`, `symlinkAllModules`), including after an explicit grant
for the installation directories. Download/resolution succeeded. Do not mistake
the later successful lockfile-only operation for a successful installation.
The failed install left local `node_modules` incomplete: direct resolution of
both `axios/package.json` and `vite/package.json` returned `MODULE_NOT_FOUND`.
Do not run or publish a build from this incomplete local installation.

A separate pnpm 10.34.5 frozen lockfile-only compatibility check was also blocked
by an EPERM while registering its project link; the lockfile hash was unchanged.
Compatibility with that CI toolchain has therefore not been verified by execution.
The follow-up registry audit timed out (code 23); no new vulnerability count or
clearance is claimed. In particular, follow-redirects still resolves to 1.16.0
in the prepared lockfile and the other baseline findings remain open for review.

Next action: complete a frozen-lockfile install in the user's normal local
PowerShell session with the existing pnpm store, verify installed versions,
then run Node 22 tests, both type checks, production build, isolated browser
tap/payment scenarios, and the audit. None of those post-update regression
results is yet available. Keep this work uncommitted/unpushed until verification.
No live service, database, wallet, or configuration was changed; unrelated
project-status and daily-reward document edits were preserved.

## Completed verification — 2026-11-12

- Installed versions: Axios 1.20.0, Vite 6.4.6, checked from their actual local
  package manifests rather than inferred from the requested versions.
- The prepared lockfile was unchanged by the user's frozen installation:
  SHA-256 `D3097A884B4C8C03A3D974171BF7AE64315EDA6FEA70E64531F155D9CD8D9972`.
- Node 22.23.3 full test suite: 358 passed, 24 suites, zero failed/skipped.
  An additional run without network permission reproduced 13 failures, all
  `connect EACCES 127.0.0.1` in the loopback gate and HTTP fixture tests. After
  granting network access for those loopback fixtures, the unchanged suite
  again passed all 358 tests. No test assertions or application code were
  relaxed to obtain the passing result.
- Both TypeScript checks passed (frontend and server).
- Production build passed with Vite 6.4.6. The existing >500 kB chunk-size
  warning remains; the Wallet chunk was approximately 699.65 kB before gzip.
- Tap retry browser scenarios passed for both a lost reply and HTTP 500:
  reload/reconnect/timers respected Retry-After, retried the original batch,
  and credited each of two taps only once.
- Wallet retry browser scenarios passed in English, Persian and Arabic:
  two verification attempts, zero new orders, zero wallet sends.
- Startup bundle and Chromium Home-to-Wallet navigation passed. Cold Home
  excluded the wallet SDK; the Wallet route loaded it successfully, with no
  external requests forwarded. These are isolated synthetic browser tests,
  not a new live payment or deployed-service test.
- `git diff --check` passed. The unrelated pre-existing edits in
  `DAILY_REWARD_ARCHIVE.md` and `PROJECT_STATUS_20261030.md` were preserved.

The successful follow-up registry audit reported 17 findings: 10 high,
6 moderate, 1 low, zero critical, versus 34 in the baseline response. The
returned findings no longer included Axios or Vite. This is a registry
advisory/version result, not proof that all application paths are secure.
Remaining matches include React Router, nanoid, js-yaml, brace-expansion,
source-map-js, follow-redirects, deepmerge and minimatch. No exclusions or
suppression were introduced. Review these in a separate bounded change;
deepmerge still had no patched version in the audit response.

The pnpm 10.34.5 CI installation check remains unverified because its earlier
local project-link registration was blocked by EPERM. The successful frozen
installation above used pnpm 11.25.0; do not claim both toolchains were tested.
After the local commit, the next release step is a user-authorized push of this
limited update, followed by deployment verification. Live data and settings
remain unchanged.
