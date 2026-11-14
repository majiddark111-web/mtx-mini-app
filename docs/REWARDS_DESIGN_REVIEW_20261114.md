# Missions and Daily Reward visual consistency — 2026-11-14

The user accepted Store/Inventory on their phone and requested the next step.
This change brings Missions and Daily Reward into the navy/cyan/gold robot theme.

## Changes

- Shared home branding and direct navigation between Missions and Daily Reward.
- Responsive mission cards, reward amounts, progress bars, streak days, combo
  options/slots and cipher input. Claimed states remain disabled and are green.
- Scoped styles remain readable with light/system preferences and do not change
  unrelated pages. No new image assets, dependencies, polling or animation.
- One descriptive page heading on Daily Reward; reward amount is a subheading.
- Accessible mission progress bars clamp the visual percentage to 0–100 only.
  Server progress/targets remain displayed as received and claim eligibility is
  unchanged. Numeric progress and cipher counts are isolated for RTL.
- Explicit empty Missions message after a successful authenticated empty result.

The claim handlers, `useRewardRequest`, request bodies, amounts, eligibility,
shared pending lock and duplicate-claim protections are unchanged. All test
claims below are synthetic; no live user reward was claimed or reset.

## Verification

All 26 design scenarios and 45 regression scenarios passed (71 total). Frontend
TypeScript, changed-file ESLint and production build also passed.

- 26 isolated Chromium design scenarios: EN/FA/AR; 320–844px viewports;
  portrait/landscape; light/dark/system preferences; claimed, empty, guest,
  loading, read-only retry, large amounts and bounded visual progress.
- Synthetic mission, daily, combo and cipher claims each issue one correct POST,
  refresh their status, then disable the claimed action. Incomplete missions and
  unanswered challenges stay disabled. Non-action scenarios issue no POST.
- Horizontal overflow, visible keyboard focus, headings, link targets and final
  content reachable above fixed navigation are checked.
- The existing 45-scenario browser regression suite is rerun to check repeated
  clicks, cross-action locks, unknown outcomes, account changes, expiry, inventory
  activation and read-only recovery. This includes 19 reward, 12 referral and
  14 inventory scenarios.
- Frontend TypeScript, changed-file ESLint and production build checks accompany
  the change. The existing large Wallet chunk warning is outside this scope.
- Persian Daily Reward 320px and English Missions 390px screenshots inspected.
  Full-page captures show the fixed navigation at its initial viewport position;
  separate bottom-scroll assertions check reachability.

## Handoff

Implementation is local; Push, frontend Live and real-phone visual acceptance
remain pending. Check both pages and scroll to the bottom. If the daily reward
was already claimed, it must remain disabled; do not reset it or wait for another
day solely to approve the new appearance.

Backup automation remains paused. No Render/Neon configuration, credentials,
database contents, payments or hosting costs were changed.
