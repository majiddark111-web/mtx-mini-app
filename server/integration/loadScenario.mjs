import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

export const LOAD_PROFILE = Object.freeze({
  users: Object.freeze([1, 5, 10]), rounds: 5, intervalMs: 2000, taps: 15,
  p95BudgetMs: 1500, maxBudgetMs: 5000, schedulingBudgetMs: 90000,
});

export function latencySummary(samples) {
  assert.ok(samples.length > 0 && samples.every((value) => Number.isFinite(value) && value >= 0));
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction) => Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 100) / 100;
  return { p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: percentile(1) };
}

// A fixed, closed-loop smoke workload: never catch up missed rounds or increase
// concurrency from environment variables on infrastructure shared with staging.
export async function runLoadScenario({ applyTaps, verify, onStage = () => undefined,
  now = Date.now, monotonic = () => performance.now(), pause = delay }) {
  const started = monotonic(); const reports = [];
  const checkDeadline = () => {
    if (monotonic() - started >= LOAD_PROFILE.schedulingBudgetMs) throw new Error('LOAD_SCHEDULING_BUDGET_EXCEEDED');
  };
  for (const count of LOAD_PROFILE.users) {
    checkDeadline();
    const users = Array.from({ length: count }, () => 'load:' + randomUUID());
    const samples = []; let failures = 0; let sent = 0;
    const stageStarted = monotonic();
    for (let round = 0; round < LOAD_PROFILE.rounds; round++) {
      checkDeadline();
      const roundStarted = monotonic();
      const work = users.map(async (userId) => {
        const batch = { batchId: randomUUID(), taps: LOAD_PROFILE.taps, durationMs: LOAD_PROFILE.intervalMs };
        const submit = async () => {
          const before = monotonic(); sent++;
          try {
            const result = await applyTaps(userId, batch, now());
            assert.equal(result.flagged, false);
            assert.equal(result.acceptedTaps, LOAD_PROFILE.taps);
            return result;
          } finally { samples.push(monotonic() - before); }
        };
        // The final round races two copies to test locking and durable receipts.
        const copies = await Promise.allSettled(Array.from({ length: round === LOAD_PROFILE.rounds - 1 ? 2 : 1 }, submit));
        assert.ok(copies.every((result) => result.status === 'fulfilled'), 'LOAD_OPERATION_FAILED');
        assert.equal(copies.filter((result) => !result.value.duplicate).length, 1, 'LOAD_DUPLICATE_CREDIT');
      });
      const results = await Promise.allSettled(work);
      failures += results.filter((result) => result.status === 'rejected').length;
      const timings = latencySummary(samples);
      if (failures || timings.maxMs > LOAD_PROFILE.maxBudgetMs || timings.p95Ms > LOAD_PROFILE.p95BudgetMs) {
        onStage({ users: count, calls: sent, failedUsers: failures, ...timings, passed: false });
        throw new Error(failures ? 'LOAD_CORRECTNESS_FAILED' : 'LOAD_LATENCY_BUDGET_EXCEEDED');
      }
      if (round < LOAD_PROFILE.rounds - 1) await pause(Math.max(0, LOAD_PROFILE.intervalMs - (monotonic() - roundStarted)));
    }
    const elapsedMs = monotonic() - stageStarted;
    const report = { users: count, calls: sent, uniqueBatches: count * LOAD_PROFILE.rounds,
      duplicateCalls: count, elapsedMs: Math.round(elapsedMs),
      completedCallsPerSecond: Math.round(sent * 1000 / Math.max(1, elapsedMs) * 100) / 100,
      ...latencySummary(samples), failedUsers: failures, passed: true };
    // Independent stored-state checks are excluded from timed tap operations.
    try { await verify(users, LOAD_PROFILE.rounds, LOAD_PROFILE.taps); }
    catch {
      onStage({ ...report, passed: false, verificationFailed: true });
      throw new Error('LOAD_CORRECTNESS_FAILED');
    }
    reports.push(report); onStage(report);
  }
  return reports;
}
