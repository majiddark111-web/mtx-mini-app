import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { GameStorage } from './src/gameStorage.ts';
import { LOAD_PROFILE, latencySummary, runLoadScenario } from './integration/loadScenario.mjs';
import { runIsolatedLoad } from './integration/loadRun.mjs';

function fixture() {
  let clock = 100000; const storage = new GameStorage(); const pauses = []; const reports = [];
  const options = {
    now: () => clock, monotonic: () => clock,
    pause: async (ms) => { pauses.push(ms); clock += ms; },
    applyTaps: (user, batch, now) => storage.applyTaps(user, batch, now),
    verify: async (users, rounds, taps) => {
      for (const user of users) assert.equal((await storage.stateFor(user, clock)).coins, rounds * taps);
    },
    onStage: (report) => reports.push(report),
  };
  return { options, storage, pauses, reports, advance: (ms) => { clock += ms; } };
}

test('fixed profile completes 96 calls, 80 unique batches and 16 independent users with a simulated clock', async () => {
  const f = fixture(); let calls = 0; let active = 0; let peak = 0;
  const apply = f.options.applyTaps;
  f.options.applyTaps = async (...args) => {
    calls++; active++; peak = Math.max(peak, active);
    try { return await apply(...args); } finally { active--; }
  };
  const reports = await runLoadScenario(f.options);
  assert.deepEqual(reports.map((r) => r.users), [1, 5, 10]);
  assert.equal(calls, 96); assert.equal(peak, 20); assert.equal(active, 0);
  assert.equal(reports.reduce((sum, r) => sum + r.uniqueBatches, 0), 80);
  assert.equal((await f.storage.stateSnapshot()).length, 16);
  assert.equal(f.storage.queue.size(), 80);
  assert.equal(f.pauses.length, 12); assert.ok(f.pauses.every((ms) => ms === 2000));
  assert.ok(Object.isFrozen(LOAD_PROFILE) && Object.isFrozen(LOAD_PROFILE.users));
});

test('percentiles use nearest rank without mutating samples', () => {
  const values = [100, 1, 50, 3];
  assert.deepEqual(latencySummary(values), { p50Ms: 3, p95Ms: 100, maxMs: 100 });
  assert.deepEqual(values, [100, 1, 50, 3]);
  assert.throws(() => latencySummary([])); assert.throws(() => latencySummary([NaN]));
});

test('unexpected error stops scheduling and drains concurrent copies before rejecting', async () => {
  const f = fixture(); let calls = 0; let drained = false;
  const apply = f.options.applyTaps;
  f.options.applyTaps = async (...args) => {
    calls++;
    if (calls === 5) throw new Error('simulated failure');
    const result = await apply(...args);
    if (calls === 6) drained = true;
    return result;
  };
  await assert.rejects(runLoadScenario(f.options), /LOAD_CORRECTNESS_FAILED/);
  assert.equal(calls, 6); assert.equal(drained, true);
  assert.equal(f.reports[0].passed, false);
});

test('incorrect duplicate acknowledgements fail the workload', async () => {
  const f = fixture(); const apply = f.options.applyTaps;
  f.options.applyTaps = async (...args) => ({ ...await apply(...args), duplicate: false });
  await assert.rejects(runLoadScenario(f.options), /LOAD_CORRECTNESS_FAILED/);
  assert.equal(f.reports.length, 1);
});

test('slow responses stop before the next round or higher load stage', async () => {
  const f = fixture(); const apply = f.options.applyTaps;
  f.options.applyTaps = async (...args) => { const result = await apply(...args); f.advance(1600); return result; };
  await assert.rejects(runLoadScenario(f.options), /LOAD_LATENCY_BUDGET_EXCEEDED/);
  assert.equal(f.reports[0].calls, 1); assert.equal(f.pauses.length, 0);
});

test('scheduling deadline prevents new work after a delayed pause', async () => {
  const f = fixture(); let calls = 0; const apply = f.options.applyTaps;
  f.options.applyTaps = (...args) => { calls++; return apply(...args); };
  f.options.pause = async () => f.advance(90000);
  await assert.rejects(runLoadScenario(f.options), /LOAD_SCHEDULING_BUDGET_EXCEEDED/);
  assert.equal(calls, 1);
});

test('stored verification failure reports a failed stage and does not start a higher stage', async () => {
  const f = fixture();
  f.options.verify = async () => { throw new Error('bad stored balance'); };
  await assert.rejects(runLoadScenario(f.options), /LOAD_CORRECTNESS_FAILED/);
  assert.equal(f.reports.length, 1);
  assert.equal(f.reports[0].passed, false);
  assert.equal(f.reports[0].verificationFailed, true);
});

function providerFixture({ migrationFailure = false, cleanupFailure = false } = {}) {
  let closed = 0;
  const postgres = {
    query: async () => { if (migrationFailure) throw new Error('MIGRATION_FAILED'); return { rows: [] }; },
    transaction: async (operation) => operation(postgres),
  };
  return { postgres, redis: { command: async () => null },
    close: async () => { closed++; if (cleanupFailure) throw new Error('CLEANUP_FAILED'); },
    closed: () => closed };
}

test('load lifecycle always cleans after success, workload failure and migration failure', async () => {
  const passing = providerFixture();
  assert.deepEqual(await runIsolatedLoad(passing, { scenario: async () => ['passed'] }), ['passed']);
  assert.equal(passing.closed(), 1);
  const failing = providerFixture();
  await assert.rejects(runIsolatedLoad(failing, { scenario: async () => { throw new Error('WORKLOAD_FAILED'); } }), /WORKLOAD_FAILED/);
  assert.equal(failing.closed(), 1);
  const migration = providerFixture({ migrationFailure: true });
  await assert.rejects(runIsolatedLoad(migration), /MIGRATION_FAILED/);
  assert.equal(migration.closed(), 1);
});

test('cleanup failure cannot produce a successful load result', async () => {
  const provider = providerFixture({ cleanupFailure: true });
  await assert.rejects(runIsolatedLoad(provider, { scenario: async () => ['passed'] }), /CLEANUP_FAILED/);
  assert.equal(provider.closed(), 1);
});

test('stored-state verification detects missing records and still cleans', async () => {
  const provider = providerFixture();
  await assert.rejects(runIsolatedLoad(provider, { scenario: async ({ verify }) => verify(['missing'], 5, 15) }), /LOAD_MISSING_USERS/);
  assert.equal(provider.closed(), 1);
});

test('entry point refuses missing connections without a success or scope marker', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL; delete env.POSTGRES_URL; delete env.REDIS_URL;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', 'server/integration/loadIsolated.mjs'], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MTX_ISOLATED_LOAD_FAILED ISOLATED_CONNECTION_CONFIG_MISSING/);
  assert.doesNotMatch(result.stdout, /MTX_ISOLATED_SCOPE|PASS_AND_CLEAN/);
});
