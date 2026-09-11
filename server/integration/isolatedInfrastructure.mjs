import { randomUUID } from 'node:crypto';

const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const expiringWrite = `
local args = {ARGV[1], KEYS[1]}
for i = 2, #ARGV do table.insert(args, ARGV[i]) end
local result = redis.call(unpack(args))
if redis.call('PTTL', KEYS[1]) == -1 then redis.call('PEXPIRE', KEYS[1], 3600000) end
return result
`;

// This scopes the trusted integration runner; it is not a sandbox for arbitrary SQL.
export async function createIsolatedScope(base, { runId = randomUUID() } = {}) {
  if (!runIdPattern.test(runId)) throw new Error('INVALID_RUN_ID');
  const schema = 'mtx_test_' + runId.replaceAll('-', '');
  const redisPrefix = 'mtx:test:' + runId + ':';
  const owned = await base.postgres.transaction(async (db) => {
    await db.query('CREATE SCHEMA "' + schema + '"', []);
    const result = await db.query('SELECT oid FROM pg_namespace WHERE nspname = $1', [schema]);
    if (!result.rows[0]?.oid) throw new Error('SCHEMA_CREATION_NOT_VERIFIED');
    return result.rows[0].oid;
  });
  const active = new Set(); const keys = new Set();
  let closed = false; let closing;
  const track = (operation) => {
    if (closed) return Promise.reject(new Error('SCOPE_CLOSED'));
    const pending = Promise.resolve().then(operation);
    active.add(pending);
    void pending.finally(() => active.delete(pending)).catch(() => undefined);
    return pending;
  };
  const transaction = (operation) => track(() => base.postgres.transaction(async (db) => {
    await db.query("SELECT set_config('search_path', $1, true), set_config('statement_timeout', '15000', true), set_config('lock_timeout', '3000', true)", ['"' + schema + '"']);
    const result = await db.query('SELECT current_schema() AS name', []);
    if (result.rows[0]?.name !== schema) throw new Error('SCHEMA_ISOLATION_FAILED');
    return operation(db);
  }));
  const postgres = { transaction, query: (sql, values = []) => transaction((db) => db.query(sql, values)) };
  const redis = { command: (parts) => track(async () => {
    if (!Array.isArray(parts) || parts.some((part) => typeof part !== 'string')) throw new Error('REDIS_COMMAND_NOT_ALLOWED');
    const command = parts[0]?.toUpperCase();
    if (!['GET', 'SET', 'RPUSH', 'LPOP', 'LLEN', 'DEL', 'EXISTS'].includes(command) || parts.length < 2) throw new Error('REDIS_COMMAND_NOT_ALLOWED');
    const names = command === 'DEL' || command === 'EXISTS' ? parts.slice(1) : [parts[1]];
    const scoped = names.map((key) => redisPrefix + key);
    for (const key of scoped) keys.add(key);
    if (keys.size > 1000) throw new Error('TEST_KEY_LIMIT_EXCEEDED');
    if (command === 'SET' || command === 'RPUSH') return base.redis.command(['EVAL', expiringWrite, '1', scoped[0], command, ...parts.slice(2)]);
    return base.redis.command([command, ...scoped, ...(names.length === 1 && command !== 'DEL' && command !== 'EXISTS' ? parts.slice(2) : [])]);
  }) };

  const close = () => {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      // No cleanup can overtake a write that the runner has already submitted.
      await Promise.allSettled([...active]);
      const failures = [];
      try {
        if (keys.size) {
          const exactKeys = [...keys];
          await base.redis.command(['DEL', ...exactKeys]);
          if (Number(await base.redis.command(['EXISTS', ...exactKeys])) !== 0) throw new Error('TEST_KEYS_REMAIN');
        }
      } catch { failures.push('redis'); }
      try {
        await base.postgres.transaction(async (db) => {
          await db.query("SELECT set_config('statement_timeout', '15000', true), set_config('lock_timeout', '3000', true)", []);
          const current = await db.query('SELECT oid FROM pg_namespace WHERE nspname = $1', [schema]);
          if (current.rows.length && current.rows[0].oid !== owned) throw new Error('SCHEMA_OWNERSHIP_CHANGED');
          if (current.rows.length) await db.query('DROP SCHEMA "' + schema + '" CASCADE', []);
        });
        const remaining = await base.postgres.query('SELECT oid FROM pg_namespace WHERE nspname = $1', [schema]);
        if (remaining.rows.length) throw new Error('TEST_SCHEMA_REMAINS');
      } catch { failures.push('postgres'); }
      if (failures.length) throw new Error('CLEANUP_FAILED:' + failures.join(','));
    })();
    return closing;
  };
  return { postgres, redis, schema, redisPrefix, close };
}
