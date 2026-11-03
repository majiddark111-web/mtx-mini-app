import test from 'node:test';
import assert from 'node:assert/strict';
import { neonProbeConfig, neonFinalProbeConfig, probeNeon, probeFinalNeon, safeProbeFailure, migrationReference } from './neonReadOnlyProbe.mjs';

const url = 'postgresql://neondb_owner:fixture%40only@ep-shy-frost-aoj2cl9v.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
test('Neon probe enforces target, credentials and TLS independently of active app settings', () => {
  const config = neonProbeConfig({ MTX_NEON_PROBE_URL: url, DATABASE_URL: 'ignored', POSTGRES_SSL: 'false' });
  assert.equal(config.password, 'fixture@only');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.minVersion, 'TLSv1.2');
  assert.equal(config.ssl.servername, new URL(url).hostname);
  assert.equal(config.enableChannelBinding, true);
  assert.equal(config.connectionString, undefined);
  assert.match(config.options, /default_transaction_read_only=on/);
  assert.equal(config.connectionTimeoutMillis, 15000);
  for (const bad of ['', 'not-a-url', url.replace('neon.tech', 'example.com'),
    url.replace('neondb?', 'other?'), url.replace('neondb_owner:', 'other:'),
    url.replace('fixture%40only', ''), url.replace('require&', 'disable&'),
    url+'&options=unsafe', url+'&sslrootcert=evil', url+'#bad',
    url.replace('.tech/', '.tech:5433/')]) {
    assert.throws(() => neonProbeConfig({ MTX_NEON_PROBE_URL: bad }), /NEON_PROBE_CONFIG/);
  }
  assert.throws(() => neonProbeConfig({ DATABASE_URL: url }), /NEON_PROBE_CONFIG/);
});

function fixture(fault, database = 'neondb') {
  const calls = [];
  const ref = [{ version: 6, name: '006_daily_reward_history.sql', checksum: 'fixture' }];
  const client = {
    connection: { stream: {
      encrypted: true, authorized: fault !== 'tls', authorizationError: null,
      getProtocol: () => 'TLSv1.3',
      getPeerCertificate: () => ({ subjectaltname: 'DNS:' + new URL(url).hostname }),
    } },
    on() {}, async connect() { calls.push('connect'); if (fault === 'connect') throw new Error('private'); },
    async end() { calls.push('end'); },
    async query(sql) {
      calls.push(sql);
      if (fault === 'query') throw new Error('private');
      if (sql.includes('current_database')) return { rows: [{ db: fault === 'identity' ? 'wrong' : database,
        role: fault === 'role' ? 'wrong' : 'neondb_owner',
        version: fault === 'version' ? 170000 : 180006,
        readonly: fault === 'readonly' ? 'off' : 'on', tls: false }] };
      if (sql.includes('SELECT version')) return { rows: fault === 'schema' ? [] : ref };
      if (sql.includes('AS tables')) return { rows: [{ tables: 20, trigger: fault !== 'trigger', legacy: 3, timed: 1 }] };
      return { rows: [] };
    },
  };
  return { calls, client, ref };
}
test('Neon accepts verified client TLS despite backend ssl=false; stays read-only and closes', async () => {
  const f = fixture();
  assert.deepEqual(await probeNeon({ MTX_NEON_PROBE_URL: url }, () => f.client, f.ref),
    { tls: true, readonly: true, tables: 20, migrations: 1, rewardTrigger: true });
  assert.equal(f.calls[1], 'BEGIN READ ONLY');
  assert.equal(f.calls.at(-2), 'ROLLBACK');
  assert.equal(f.calls.at(-1), 'end');
  for (const sql of f.calls.slice(1, -1)) assert.match(sql, /^(SELECT|BEGIN READ ONLY|ROLLBACK)/);
  assert.ok(f.calls.every(sql => !sql.includes('pg_stat_ssl')));
});
for (const fault of ['connect', 'query', 'identity', 'role', 'version', 'readonly', 'tls', 'schema', 'trigger']) {
  test('Neon '+fault+' failure closes the connection', async () => {
    const f = fixture(fault);
    await assert.rejects(probeNeon({ MTX_NEON_PROBE_URL: url }, () => f.client, f.ref));
    assert.equal(f.calls.at(-1), 'end');
  });
}
for (const [name, change] of [
  ['missing socket', client => { delete client.connection; }],
  ['plaintext socket', client => { client.connection.stream.encrypted = false; }],
  ['untrusted certificate', client => { client.connection.stream.authorized = false; }],
  ['authorization error', client => { client.connection.stream.authorizationError = url; }],
  ['wrong hostname', client => { client.connection.stream.getPeerCertificate = () => ({ subjectaltname: 'DNS:wrong.example' }); }],
  ['missing certificate', client => { client.connection.stream.getPeerCertificate = () => ({}); }],
  ['missing certificate method', client => { delete client.connection.stream.getPeerCertificate; }],
  ['certificate read error', client => { client.connection.stream.getPeerCertificate = () => { throw new Error(url); }; }],
  ['old TLS protocol', client => { client.connection.stream.getProtocol = () => 'TLSv1.1'; }],
  ['unknown TLS protocol', client => { delete client.connection.stream.getProtocol; }],
]) {
  test('Neon rejects ' + name + ' before SQL without leaking details', async () => {
    const f = fixture();
    change(f.client);
    await assert.rejects(probeNeon({ MTX_NEON_PROBE_URL: url }, () => f.client, f.ref), error => {
      assert.equal(safeProbeFailure(error), 'NEON_PROBE_TLS');
      assert.equal(error.message, 'NEON_PROBE_TLS');
      return true;
    });
    assert.deepEqual(f.calls, ['connect', 'end']);
  });
}
test('Neon accepts TLS 1.2 with a matching wildcard certificate', async () => {
  const f = fixture();
  f.client.connection.stream.getProtocol = () => 'TLSv1.2';
  f.client.connection.stream.getPeerCertificate = () => ({ subjectaltname: 'DNS:*.c-2.ap-southeast-1.aws.neon.tech' });
  assert.equal((await probeNeon({ MTX_NEON_PROBE_URL: url }, () => f.client, f.ref)).tls, true);
});
test('Neon errors never copy arbitrary secrets from messages, stacks or codes', () => {
  assert.equal(safeProbeFailure(new Error(url)), 'CONNECTION_OR_QUERY_FAILED');
  assert.equal(safeProbeFailure({ code: url }), 'CONNECTION_OR_QUERY_FAILED');
  assert.equal(safeProbeFailure({ code: '28P01', message: url }), '28P01');
  assert.equal(safeProbeFailure(new Error('NEON_PROBE_TLS ' + url)), 'CONNECTION_OR_QUERY_FAILED');
});
test('Migration reference reads current files without running migrations', async () => {
  const ref = await migrationReference();
  assert.ok(ref.length >= 6);
  assert.deepEqual(ref.map(r => r.version), Array.from({ length: ref.length }, (_, index) => index + 1));
  for (const row of ref) assert.match(row.checksum, /^[a-f0-9]{64}$/);
});

const finalUrl = url.replace('/neondb?', '/mtx_final_20261101?').replace('sslmode=require', 'sslmode=verify-full');
test('Final gate accepts only the active final DATABASE_URL with verified TLS', () => {
  const config = neonFinalProbeConfig({ DATABASE_URL: finalUrl, MTX_NEON_PROBE_URL: url });
  assert.equal(config.database, 'mtx_final_20261101');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.password, 'fixture@only');
  assert.match(config.options, /default_transaction_read_only=on/);
  for (const environment of [
    {}, { MTX_NEON_PROBE_URL: finalUrl }, { POSTGRES_URL: finalUrl },
    { DATABASE_URL: url }, { DATABASE_URL: ' ' + finalUrl },
    { DATABASE_URL: finalUrl, POSTGRES_SSL: 'false' },
    { DATABASE_URL: finalUrl, POSTGRES_TLS_REJECT_UNAUTHORIZED: 'false' },
    { DATABASE_URL: finalUrl.replace('verify-full', 'require') },
    { DATABASE_URL: finalUrl.replace('sslmode=verify-full&', '') },
    { DATABASE_URL: finalUrl + '&sslmode=verify-full' },
    { DATABASE_URL: finalUrl + '&sslmode=disable' },
    { DATABASE_URL: finalUrl.replace('neon.tech', 'example.com') },
    { DATABASE_URL: finalUrl.replace('neondb_owner:', 'other:') },
  ]) assert.throws(() => neonFinalProbeConfig(environment), /NEON_PROBE_CONFIG/);
  assert.throws(() => neonProbeConfig({ MTX_NEON_PROBE_URL: finalUrl }), /NEON_PROBE_CONFIG/);
});

test('Final gate verifies destination identity and schema without writes', async () => {
  const f = fixture(undefined, 'mtx_final_20261101');
  const result = await probeFinalNeon({ DATABASE_URL: finalUrl }, config => {
    assert.equal(config.database, 'mtx_final_20261101');
    return f.client;
  }, f.ref);
  assert.deepEqual(result, { database: 'mtx_final_20261101', tls: true, readonly: true,
    tables: 20, migrations: 1, rewardTrigger: true });
  for (const sql of f.calls.slice(1, -1)) assert.match(sql, /^(SELECT|BEGIN READ ONLY|ROLLBACK)/);
  assert.equal(f.calls.at(-1), 'end');
});

for (const fault of ['identity', 'role', 'version', 'readonly', 'tls', 'schema', 'trigger']) {
  test('Final gate blocks ' + fault + ' and closes connection', async () => {
    const f = fixture(fault, 'mtx_final_20261101');
    await assert.rejects(probeFinalNeon({ DATABASE_URL: finalUrl }, () => f.client, f.ref));
    assert.equal(f.calls.at(-1), 'end');
  });
}

test('Final gate rejects rehearsal database reported by the server', async () => {
  const f = fixture();
  await assert.rejects(probeFinalNeon({ DATABASE_URL: finalUrl }, () => f.client, f.ref), /NEON_PROBE_IDENTITY/);
  assert.equal(f.calls.at(-1), 'end');
});
