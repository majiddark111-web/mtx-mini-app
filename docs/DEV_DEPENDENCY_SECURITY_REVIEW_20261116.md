# Development dependency security review — 2026-11-16

Baseline: `5e56d50`, accepted by the user after deployment and phone checks.
This step changes development-tool dependencies only. No production operation,
database write, wallet send, application payment change or deployment is included.

## Baseline and scoped update

The fresh registry audit returned 13 advisory/version matches: 7 high,
5 moderate, 1 low, zero critical. These are not proven application exploits.

The following patched versions were verified against registry metadata and
upstream advisories. Scoped pnpm overrides preserve the parent versions and
stay inside their declared dependency ranges:

| Parent dependency | Installed baseline | Selected patch | Parent range |
| --- | --- | --- | --- |
| postcss > nanoid | 3.3.16 | 3.3.18 | ^3.3.16 |
| postcss > source-map-js | 1.2.1 | 1.2.2 | ^1.2.1 |
| @eslint/eslintrc > js-yaml | 4.3.1 | 4.3.2 | ^4.3.0 |
| minimatch 3 > brace-expansion | 1.1.18 | 1.1.21 | ^1.1.7 |
| minimatch 10 > brace-expansion | 5.0.9 | 5.0.12 | ^5.0.8 |

All selected engine requirements permit the project's Node 22 runtime.
The dependency tree places these packages under Vite/PostCSS or ESLint and
TypeScript-ESLint. No direct imports were found in src, server or scripts.
This does not establish that parsing arbitrary untrusted input would be safe.

Upstream references:

- [Nano ID zero-size custom generator](https://github.com/advisories/GHSA-2v37-7h3g-55p8).
- [js-yaml merge-source work limits](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- [source-map-js section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- [brace-expansion rewrite complexity and patched branches](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

## Verification status

Lockfile preparation completed with pnpm 11.25.0 on Node 22.23.3. The reviewed
diff changes only the five scoped package versions above, their integrity
hashes, references and overrides. No parent or unrelated package version
changed. Supply-chain verification remained enabled and lifecycle scripts
were disabled.

Prepared lockfile SHA-256:
`3C96A1EFA3A3D96C1A3349C0BAF4891EE671DB475A875D9D0AD9B6751845FB3A`.

Audit of this prepared lockfile returned 4 findings: 3 moderate, 1 low, zero
high or critical. The remaining matches are the two React Router advisories,
minimatch and deepmerge. A post-install audit using pinned Node 22 confirmed
the same counts and advisory IDs. The preceding retry using the bundled pnpm
launcher returned no vulnerability summary and was not treated as a pass.
This is advisory/version matching, not proof that all application paths are
secure; actual package installation was checked separately below.

The initial full frozen install passed supply-chain verification but failed with
`ERR_PNPM_EPERM` at `symlinkAllModules` when creating the js-yaml link under
@eslint/eslintrc. pnpm additionally emitted a TypeError while handling that
failure. The user then completed the frozen installation in their normal
PowerShell session. No permissions or supply-chain checks were bypassed.

Completed post-install verification on Node 22.23.3:

- Resolving and loading each dependency through its actual parent confirmed
  all five selected versions, including both brace-expansion branches.
- The lockfile SHA-256 remained exactly as recorded above.
- Full suite: 358 passed, 24 suites, zero failures, skipped or cancelled tests.
- Both frontend and server TypeScript checks passed.
- Targeted ESLint check passed after installation: src/main.tsx,
  src/router/index.tsx and scripts/test-startup-bundle.mjs. This is not a claim
  that the entire repository was linted.
- Vite 6.4.6 production build passed, without a >500 kB chunk warning.
- Production bundle and isolated Chromium Home-to-Wallet navigation passed;
  the payment encoder remained lazy and no external requests were forwarded.
- All 8 isolated lazy-wallet scenarios passed with the real encoder and stubbed
  API/wallet, including errors, expiry, replay, account change and unmount.
- Tap retry passed: reload/reconnect/timers respected HTTP 429 and a lost reply
  retried the original batch; two taps were credited only once each.
- `git diff --check` passed; unrelated document edits were preserved.

These are local results, not a new live payment or a post-deploy phone test.
Push and deployment remain user-controlled and have not been performed here.

## Explicitly excluded

The minimatch advisory currently lists a major-version fix (11.0.1); do not
force that version underneath TypeScript-ESLint in this patch. React Router's
remaining major-version advisory matches and the unpatched deepmerge finding
also remain separate. No audit suppressions, supply-chain policy changes,
TLS bypass or lifecycle-script enablement are part of this change.

Pre-existing edits to DAILY_REWARD_ARCHIVE.md and PROJECT_STATUS_20261030.md
are unrelated and must remain untouched and outside the eventual commit.
