import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { createServer } from 'node:net';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';
import { migrationReference } from '../server/neonReadOnlyProbe.mjs';

// Called only by the private-directory wrapper. No external DB URL is accepted.
const dir = await realpath(process.argv[2]);
assert.equal(dirname(dir), await realpath('.build-verification'));
assert.match(basename(dir), /^restore-drill-[a-f0-9]{32}$/);
assert.equal(await readFile(join(dir, 'private-directory.marker'), 'utf8'), 'MTX_PRIVATE_RESTORE');
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const archive = join(dir, 'source.backup'), data = join(dir, 'data');
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
// Neon dumps timestamps in UTC; keep the local re-dump independent of the
// Windows timezone when comparing serialized timestamptz values.
env.PGTZ = 'UTC';
const password = randomBytes(32).toString('hex');
env.PGPASSWORD = password;
const passwordFile = join(dir, 'local-password');
await writeFile(passwordFile, password, { flag: 'wx' });
const run = (name, args, quiet = false) => {
  const result = spawnSync(join(bin, name + '.exe'), args, {
    env, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 * 1024,
    ...(quiet ? { stdio: 'ignore' } : {}),
  });
  if (result.error || result.status !== 0) throw new Error('LOCAL_' + name.toUpperCase() + '_FAILED');
  return result.stdout;
};
// Hash every COPY row as a sorted multiset, not just table counts. No row or
// per-table fingerprint is logged. Both sides use pg_restore/pg_dump text output.
function fingerprints(sql) {
  const tables = new Map();
  const lines = sql.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^COPY public\.(mtx_[a-z_]+) \((.+)\) FROM stdin;$/.exec(lines[i]);
    if (!match) continue;
    const rows = [];
    while (++i < lines.length && lines[i] !== '\\.') rows.push(lines[i]);
    assert.ok(i < lines.length, 'COPY_TERMINATOR_MISSING');
    assert.ok(!tables.has(match[1]), 'DUPLICATE_COPY');
    tables.set(match[1], { columns: match[2], count: rows.length,
      hash: createHash('sha256').update(rows.sort().join('\n')).digest('hex') });
  }
  return tables;
}
const listener = createServer();
await new Promise((yes, no) => { listener.once('error', no); listener.listen(0, '127.0.0.1', yes); });
const port = listener.address().port;
await new Promise(yes => listener.close(yes));
const flags = ['-h', '127.0.0.1', '-p', String(port), '-U', 'restore_verifier', '-d', 'postgres', '--no-password'];
let attemptedStart = false, pool, passed = false, failure, phase = 'archive';
try {
  const expected = fingerprints(run('pg_restore', ['--data-only', '--file=-', archive]));
  assert.equal(expected.size, 20, 'EXPECTED_20_TABLES');
  phase = 'initialize';
  run('initdb', ['-D', data, '-U', 'restore_verifier', '--auth=scram-sha-256', '--pwfile=' + passwordFile, '--encoding=UTF8', '--no-locale']);
  attemptedStart = true;
  run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], true);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'restore_verifier', password, database: 'postgres', max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  pool.on('error', () => {});
  const identity = await pool.query('SHOW data_directory');
  phase = 'identity';
  assert.equal(resolve(identity.rows[0].data_directory), resolve(data));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
  phase = 'restore';
  run('pg_restore', [...flags, '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', archive]);
  phase = 'row-comparison';
  const actual = fingerprints(run('pg_dump', [...flags, '--data-only', '--no-owner', '--no-privileges']));
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for (const [table, summary] of expected) {
    const restored = actual.get(table);
    if (JSON.stringify(restored) !== JSON.stringify(summary)) console.log('MTX_LOCAL_RESTORE_COMPARE', JSON.stringify({table, countsMatch:restored?.count === summary.count, columnsMatch:restored?.columns === summary.columns, contentMatch:restored?.hash === summary.hash}));
    assert.deepEqual(restored, summary, 'RESTORED_ROWS_MISMATCH');
  }
  phase = 'migrations';
  const migrations = (await pool.query('SELECT version, name, checksum FROM mtx_schema_migrations ORDER BY version')).rows;
  assert.deepEqual(migrations, await migrationReference());
  phase = 'trigger';
  const trigger = (await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.mtx_daily_claims'::regclass AND tgname='mtx_archive_daily_reward' AND NOT tgisinternal")).rows;
  assert.equal(trigger.length, 1); assert.equal(trigger[0].tgenabled, 'O');
  passed = true;
} catch (error) {
  failure = /^[A-Z_]+$/.test(error.message) ? error.message : 'RESTORE_CHECK_FAILED';
} finally {
  if (pool) await pool.end();
  if (attemptedStart) {
    const status = spawnSync(join(bin, 'pg_ctl.exe'), ['-D', data, 'status'], { env, stdio: 'ignore', windowsHide: true, timeout: 10000 });
    if (status.status === 0) {
      try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], true); }
      catch { failure = 'LOCAL_STOP_FAILED'; }
    } else if (status.status !== 3) failure = 'LOCAL_STOP_UNCONFIRMED';
  }
}
if (failure || !passed) { console.log('MTX_LOCAL_RESTORE_FAIL phase=' + phase + ' code=' + (failure || 'RESTORE_CHECK_FAILED')); process.exitCode = 1; }
else {
  await writeFile(join(dir, 'restore-pass.json'), JSON.stringify({ tables: 20, rowMultisetsMatch: true, migrations: 6, rewardTrigger: true, localClusterStopped: true }), { flag: 'wx' });
  console.log('MTX_LOCAL_RESTORE_PASS: 20 table row multisets, 6 migration checksums, enabled reward trigger; isolated cluster stopped');
}
