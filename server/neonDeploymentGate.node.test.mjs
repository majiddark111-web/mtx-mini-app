import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { probeNeonDeployment, neonDeploymentPhase, safeProbeFailure } from './neonReadOnlyProbe.mjs';

const host = 'ep-shy-frost-aoj2cl9v.c-2.ap-southeast-1.aws.neon.tech';
const environment = { DATABASE_URL: `postgresql://neondb_owner:fixture-only@${host}/mtx_final_20261101?sslmode=verify-full` };
const tableNames = ['mtx_admin_bans', 'mtx_admin_logs', 'mtx_anti_cheat_anomalies', 'mtx_challenge_claims',
  'mtx_daily_claims', 'mtx_daily_reward_history', 'mtx_equipped_cosmetics', 'mtx_events',
  'mtx_game_state', 'mtx_inventory', 'mtx_mission_claims', 'mtx_notification_read_state',
  'mtx_notifications', 'mtx_payment_intents', 'mtx_payments', 'mtx_purchases',
  'mtx_referrals', 'mtx_schema_migrations', 'mtx_tap_events', 'mtx_tap_receipts'];
const reference = Array.from({ length: 7 }, (_, index) => ({
  version: index + 1,
  name: `${String(index + 1).padStart(3, '0')}_fixture.sql`,
  checksum: createHash('sha256').update(`fixture ${index + 1}`).digest('hex'),
}));

function fixture() {
  const calls = [];
  const state = { migrations: reference.slice(0, 6), tables: [...tableNames], trigger: true,
    identity: { db: 'mtx_final_20261101', role: 'neondb_owner', version: 180006, readonly: 'on' } };
  let idleError;
  const client = {
    connection: { stream: {
      encrypted: true, authorized: true, authorizationError: null,
      getProtocol: () => 'TLSv1.3', getPeerCertificate: () => ({ subjectaltname: `DNS:${host}` }),
    } },
    on(event, handler) { assert.equal(event, 'error'); idleError = handler; },
    async connect() { calls.push('connect'); },
    async end() { calls.push('end'); },
    async query(sql) {
      calls.push(sql);
      if (state.queryError) throw state.queryError;
      if (sql.includes('current_database')) return { rows: [state.identity] };
      if (sql.includes('SELECT version')) return { rows: state.migrations };
      if (sql.includes('SELECT tablename')) return { rows: state.tables.map(tablename => ({ tablename })) };
      if (sql.includes('pg_trigger')) {
        if (state.idleFailure) idleError(new Error('private'));
        return { rows: [{ trigger: state.trigger }] };
      }
      return { rows: [] };
    },
  };
  return { calls, state, client,
    run: (phase = 'startup', ref = reference, env = environment) => probeNeonDeployment(env, config => {
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.database, 'mtx_final_20261101');
      assert.match(config.options, /default_transaction_read_only=on/);
      return client;
    }, ref, phase) };
}

test('deployment CLI is strict and defaults to startup', () => {
  assert.equal(neonDeploymentPhase([]), 'startup');
  assert.equal(neonDeploymentPhase(['--before-migrate']), 'before-migrate');
  for (const args of [['--before-migration'], ['--skip-schema'], ['--before-migrate', '--before-migrate']]) {
    assert.throws(() => neonDeploymentPhase(args), /NEON_PROBE_CONFIG/);
  }
});

test('migration 007 can pass preflight, but startup waits for it to finish', async () => {
  const before = fixture();
  assert.deepEqual(await before.run('before-migrate'), { database: 'mtx_final_20261101',
    phase: 'before-migrate', tls: true, readonly: true, tables: 20, migrations: 6,
    pendingMigrations: 1, rewardTrigger: true });
  await assert.rejects(fixture().run(), /NEON_PROBE_SCHEMA/);
  const after = fixture();
  after.state.migrations = reference;
  after.state.tables.push('mtx_new_feature');
  const result = await after.run();
  assert.equal(result.pendingMigrations, 0);
  assert.equal(result.migrations, 7);
  assert.equal(result.tables, 21);
});

test('existing release works in both modes without depending on reward row counts', async () => {
  for (const phase of ['startup', 'before-migrate']) {
    const f = fixture();
    assert.equal((await f.run(phase, reference.slice(0, 6))).pendingMigrations, 0);
    assert.deepEqual(f.calls.slice(-2), ['ROLLBACK', 'end']);
    assert.equal(f.calls[1], 'BEGIN READ ONLY');
    for (const sql of f.calls.slice(1, -1)) {
      assert.match(sql, /^(SELECT|BEGIN READ ONLY|ROLLBACK)/);
      assert.doesNotMatch(sql, /claimed_at|legacy|timed|FROM public\.mtx_daily_reward_history/);
    }
  }
});

for (const [name, change] of [
  ['empty migration history', f => { f.state.migrations = []; }],
  ['missing baseline', f => { f.state.migrations = reference.slice(0, 5); }],
  ['migration gap', f => { f.state.migrations = reference.filter(row => row.version !== 3); }],
  ['modified checksum', f => { f.state.migrations = f.state.migrations.map(row => ({ ...row, checksum: '0'.repeat(64) })); }],
  ['renamed migration', f => { f.state.migrations = f.state.migrations.map(row => ({ ...row, name: '001_other.sql' })); }],
  ['duplicate migration', f => { f.state.migrations = [...reference.slice(0, 5), reference[4]]; }],
  ['out-of-order migration', f => { f.state.migrations.reverse(); }],
  ['database ahead of code', f => { f.state.migrations = [...reference, { version: 8 }]; }],
  ['missing table masked by extra table', f => { f.state.tables[0] = 'mtx_unrelated'; }],
  ['disabled reward trigger', f => { f.state.trigger = false; }],
  ['idle connection error', f => { f.state.idleFailure = true; }],
  ['query failure', f => { f.state.queryError = new Error(environment.DATABASE_URL); }],
]) {
  test(`deployment rejects ${name} and disconnects in both modes`, async () => {
    for (const phase of ['before-migrate', 'startup']) {
      const f = fixture();
      if (phase === 'startup') f.state.migrations = reference.map(row => ({ ...row }));
      change(f);
      await assert.rejects(f.run(phase), error => {
        assert.ok(!safeProbeFailure(error).includes('fixture-only'));
        return true;
      });
      assert.equal(f.calls.at(-1), 'end');
    }
  });
}

for (const [field, value] of [['db', 'neondb'], ['role', 'other'], ['version', 170000], ['readonly', 'off']]) {
  test(`deployment retains server identity check: ${field}`, async () => {
    const f = fixture();
    f.state.identity[field] = value;
    await assert.rejects(f.run('before-migrate'), /NEON_PROBE_IDENTITY/);
    assert.equal(f.calls.at(-1), 'end');
  });
}

test('deployment rejects invalid client TLS before any query', async () => {
  const f = fixture();
  f.client.connection.stream.authorized = false;
  await assert.rejects(f.run('before-migrate'), /NEON_PROBE_TLS/);
  assert.deepEqual(f.calls, ['connect', 'end']);
});

test('deployment validates phase, reference and destination before creating a client', async () => {
  for (const ref of [[], reference.slice(1), [...reference, reference[6]],
    reference.map(row => ({ ...row, checksum: 'invalid' })),
    reference.map(row => ({ ...row, name: '001_wrong.sql' }))]) {
    const f = fixture();
    await assert.rejects(f.run('before-migrate', ref), /NEON_PROBE_SCHEMA/);
    assert.deepEqual(f.calls, []);
  }
  const invalidPhase = fixture();
  await assert.rejects(invalidPhase.run('skip'), /NEON_PROBE_CONFIG/);
  assert.deepEqual(invalidPhase.calls, []);
  for (const env of [{ DATABASE_URL: environment.DATABASE_URL.replace('verify-full', 'require') },
    { ...environment, POSTGRES_TLS_REJECT_UNAUTHORIZED: 'false' },
    { ...environment, POSTGRES_SSL: 'false' },
    { DATABASE_URL: environment.DATABASE_URL.replace('mtx_final_20261101', 'neondb') }, {}]) {
    const f = fixture();
    await assert.rejects(f.run('before-migrate', reference, env), /NEON_PROBE_CONFIG/);
    assert.deepEqual(f.calls, []);
  }
});
