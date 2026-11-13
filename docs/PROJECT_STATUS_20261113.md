# MTX progress checkpoint — 2026-11-13

## Estimate and boundaries

Approximately **95% of the agreed testing/Testnet MVP**, a qualitative engineering
estimate rather than completed tickets divided by a frozen total. This is not a
mainnet, security clearance or public-production readiness percentage. The older
October 30 estimate was approximately 90%; neither value is an exact measurement.
Uncommitted edits to the older checkpoint and daily archive report are preserved.

## Evidence since the earlier checkpoint

- User-reported Neon final restore verification and startup guard PASS: final
  database mtx_final_20261101, TLS, 20 tables, six migrations, reward trigger and
  zero pending migrations. User also reported post-cutover functional checks.
  This is historical evidence, not a fresh live database or backup inspection.
- Local Redis rate, HTTP and outage/reconnect results were reported as PASS,
  including preserved queued taps and prevention of duplicate credits. They do
  not establish capacity or availability of a remote Redis deployment.
- The dependency review records 358 passing tests plus type/build/browser
  checks after the bounded Axios/Vite update; user subsequently reported Live
  and successful phone smoke tests. The suite was not fully rerun for this
  CSS/Home-only follow-up.
- Game robot design 7212931: user accepted all three requested phone checks.
  Full-width art correction 546d020: user reported Live and accepted the actual
  phone rendering on November 13. See ROBOT_DESIGN_PREVIEW.md.
- Home design consistency is implemented locally in this follow-up; not yet
  counted as deployed or accepted on a phone.

## Still open

- Home publication/phone acceptance and broader visual consistency beyond Home,
  Game and the shared navigation.
- Previously outstanding phone cases: inventory consumable/skin with an owned
  item, interrupted eligible reward claim and following-day reward retention.
  Do not require a purchase, reset a claim or invent a result to clear these.
- Protected scheduled off-device backups, retention and failure notification;
  current latest recoverable backup has not been rechecked in this turn.
- Remaining dependency findings (17 in the last recorded audit, not a fresh
  count), application-path triage and continued security review.
- Measured sustained capacity, target-device performance and operational alerts.
- Explicit mainnet/real-payment approval and production reconciliation before
  any public paid rollout. Existing payment evidence is Testnet evidence.

This turn makes no live database, credentials, payment, hosting-plan or service
configuration changes. Home visual work is a separate scoped local commit;
push/deployment and phone acceptance follow separately.
