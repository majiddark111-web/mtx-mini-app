# Wallet loading optimization — 2026-11-15

The user accepted the Boost/Earn modal update and requested the next step.
The payment message encoder (@ton/core) was statically imported by Wallet even
when the user only viewed transactions or checked a pending order.

It is now loaded only for a new, non-expired, non-replayed payment order. The
order is still saved before the wallet can be opened. Account/mounted status and
the sending deadline are checked again after the extra asynchronous import.
Download errors retain the saved order through the existing recovery path.
The transaction amount, recipient, network, message encoding, deadline formula
and server confirmation flow are unchanged.

## Measured production output

The bundle check sums gzip bytes per file in the static dependency closure,
including the application entry and selected page. This is a local build size
measurement, not real-network latency, device profiling or a Render metric.

| Cold navigation | Before | After |
| --- | ---: | ---: |
| Home JavaScript | 119,218 bytes | 119,234 bytes |
| Wallet JavaScript | 327,238 bytes | 252,992 bytes |

Cold Wallet JavaScript is reduced by 74,246 bytes (about 22.7%). The purchase-only
encoder moves to a separate lazy chunk. First-time new purchases require that
additional download; simply opening Wallet or checking existing orders does not.
The production Wallet chunk is now approximately 452.79 kB uncompressed rather
than 699.70 kB, and this build no longer emits the over-500-kB chunk warning.

## Verification

- Production bundle graph assertions: TON Connect is excluded from cold Home;
  the encoder is excluded from cold Home and cold Wallet but remains in the build.
  Lookup uses source-module membership rather than optional Rollup facade names.
- Real production Home → Wallet navigation in Chromium confirms the SDK loads
  only on Wallet and the encoder does not load simply by visiting Wallet.
- Eight isolated purchase scenarios with the real encoder and a stub wallet/API:
  normal send, double click, failed chunk download, deadline expiry during loading,
  account change, unmount, replayed order and already-expired order.
  Assertions compare the entire wallet request including exact base64 payload.
  Invalid/delayed cases send nothing, create only one order and retain its record.
- Three existing EN/FA/AR payment retry browser scenarios.
- Eighteen Wallet/History visual and state browser scenarios.
- Seven durable payment recovery unit tests.
- Frontend TypeScript, changed-file ESLint and production build.

No real wallet signing, blockchain transfer, payment confirmation, hosting change
or production API mutation was performed. Existing unrelated modified documents
were left untouched. This does not resolve backend cold starts or VPN problems.

Local commit only; Push, frontend Live and phone acceptance are pending. Reopen
the miniapp after deployment, visit Wallet and verify the connection controls and
old transactions still appear. No new purchase is necessary for that smoke test.
