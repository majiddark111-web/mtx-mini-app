import assert from 'node:assert/strict';
import test from 'node:test';
import { createIsolatedScope } from './integration/isolatedInfrastructure.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
function fakeInfrastructure() {
  const sqlCalls = []; const redisCalls = []; const namespaces = new Map();
  const keys = new Map([['mtx:tap-events', 'real-game-data']]);
  let failDrop = false; let failDelete = false; let scopeName = null;
  const postgres = {
    async query(sql, values = []) {
      sqlCalls.push({ sql, values });
      if (sql.startsWith('CREATE SCHEMA')) { const name = sql.split('"')[1]; if (namespaces.has(name)) throw new Error('SCHEMA_EXISTS'); namespaces.set(name, 123); }
      if (sql.includes('FROM pg_namespace')) return { rows: namespaces.has(values[0]) ? [{ oid: namespaces.get(values[0]) }] : [] };
      if (sql.includes("set_config('search_path'")) scopeName = values[0].replaceAll('"', '');
      if (sql.startsWith('SELECT current_schema')) return { rows: [{ name: scopeName }] };
      if (sql.startsWith('DROP SCHEMA')) { if (failDrop) throw new Error('DROP_FAILED'); namespaces.delete(sql.split('"')[1]); }
      return { rows: [] };
    },
    async transaction(operation) { return operation(postgres); },
  };
  const redis = { async command(parts) {
    redisCalls.push(parts);
    if (parts[0] === 'EVAL') { keys.set(parts[3], parts[5]); return 'OK'; }
    if (parts[0] === 'GET') return keys.get(parts[1]) ?? null;
    if (parts[0] === 'DEL') { if (failDelete) throw new Error('DELETE_FAILED'); for (const key of parts.slice(1)) keys.delete(key); return 1; }
    if (parts[0] === 'EXISTS') return parts.slice(1).filter((key) => keys.has(key)).length;
    return 0;
  } };
  return { postgres, redis, sqlCalls, redisCalls, namespaces, keys, failDrop: () => { failDrop = true; }, failDelete: () => { failDelete = true; } };
}

test('isolated SQL uses only the generated schema with transaction-local settings', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  await scope.postgres.query('SELECT state FROM mtx_game_state', []);
  await scope.postgres.transaction((db) => db.query('INSERT INTO mtx_game_state VALUES ($1)', ['test']));
  const paths = base.sqlCalls.filter((call) => call.sql.includes("set_config('search_path'"));
  assert.equal(paths.length, 2);
  assert.ok(paths.every((call) => call.values[0] === '"' + scope.schema + '"'));
  assert.ok(!paths.some((call) => call.values[0].includes('public')));
  await scope.close();
  assert.equal(base.namespaces.size, 0);
});

test('Redis commands are prefixed and cleanup never touches a game key', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  await scope.redis.command(['SET', 'mtx:tap-batch:42:batch', '1', 'NX', 'PX', '600000']);
  await scope.redis.command(['RPUSH', 'mtx:tap-events', 'test-event']);
  await scope.redis.command(['GET', 'mtx:tap-events']);
  const writes = base.redisCalls.filter((parts) => parts[0] === 'EVAL');
  assert.equal(writes.length, 2);
  assert.ok(writes.every((parts) => parts[3].startsWith(scope.redisPrefix)));
  assert.ok(writes.every((parts) => parts[1].includes('PEXPIRE')));
  await scope.close(); await scope.close();
  assert.deepEqual([...base.keys], [['mtx:tap-events', 'real-game-data']]);
  assert.equal(base.sqlCalls.filter((call) => call.sql.startsWith('DROP SCHEMA')).length, 1);
  await assert.rejects(scope.redis.command(['GET', 'mtx:tap-events']), /SCOPE_CLOSED/);
});

test('unsafe scope identifiers and unscoped Redis operations fail closed', async () => {
  const base = fakeInfrastructure();
  await assert.rejects(createIsolatedScope(base, { runId: 'public' }), /INVALID_RUN_ID/);
  assert.equal(base.sqlCalls.length, 0);
  const scope = await createIsolatedScope(base, { runId });
  for (const command of [['FLUSHDB'], ['FLUSHALL'], ['EVAL', 'return 1', '0'], ['SCAN', '0'], ['RENAME', 'a', 'b']]) await assert.rejects(scope.redis.command(command), /REDIS_COMMAND_NOT_ALLOWED/);
  assert.equal(base.redisCalls.length, 0);
  await scope.close();
});

test('cleanup reports failure but still attempts both resources', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  await scope.redis.command(['SET', 'key', 'test']); base.failDrop();
  await assert.rejects(scope.close(), /CLEANUP_FAILED:postgres/);
  assert.deepEqual([...base.keys], [['mtx:tap-events', 'real-game-data']]);
});

test('Redis cleanup failure is not swallowed even if PostgreSQL cleanup succeeds', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  await scope.redis.command(['SET', 'key', 'test']); base.failDelete();
  await assert.rejects(scope.close(), /CLEANUP_FAILED:redis/);
  assert.equal(base.namespaces.size, 0);
});

test('cleanup refuses to drop a replaced schema', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  base.namespaces.set(scope.schema, 999);
  await assert.rejects(scope.close(), /CLEANUP_FAILED:postgres/);
  assert.equal(base.sqlCalls.filter((call) => call.sql.startsWith('DROP SCHEMA')).length, 0);
});

test('cleanup waits for already-started work and rejects new work', async () => {
  const base = fakeInfrastructure(); const scope = await createIsolatedScope(base, { runId });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const pending = scope.postgres.transaction(async (db) => { await gate; await db.query('SELECT 1', []); });
  const closing = scope.close();
  await assert.rejects(scope.postgres.query('SELECT 1', []), /SCOPE_CLOSED/);
  assert.equal(base.sqlCalls.filter((call) => call.sql.startsWith('DROP SCHEMA')).length, 0);
  release(); await pending; await closing;
  assert.equal(base.namespaces.size, 0);
});
