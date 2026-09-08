import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuth, hashAdminPassword, totpAt } from './adminCredentials.mjs';
import { handleRequest } from './src/app.ts';

// Shared adapter double; production uses atomic Redis Lua operations.
function testRedis() {
  const values = new Map();
  return {
    async command([operation, script, keyCount, key, counter]) {
      assert.equal(operation, 'EVAL');
      assert.equal(keyCount, '1');
      if (counter === undefined) {
        assert.match(script, /EXPIRE/);
        const attempts = (values.get(key) ?? 0) + 1;
        values.set(key, attempts);
        return attempts;
      }
      assert.match(script, /tonumber\(previous\) >= tonumber\(ARGV\[1\]\)/);
      if ((values.get(key) ?? -1) >= Number(counter)) return 0;
      values.set(key, Number(counter));
      return 1;
    },
  };
}

const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const password = 'a-long-admin-password';
const passwordHash = hashAdminPassword(password);
const moment = 1_800_000_000_000;
const options = { username: 'operator', passwordHash, totpSecret: secret, now: () => moment };
const login = (time = moment) => ({ username: 'operator', password, otp: totpAt(secret, time) });

test('verifies a hashed admin password and current TOTP', async () => {
  const auth = createAdminAuth({ ...options, redis: testRedis() });
  assert.deepEqual(await auth.verify(login()), { id: 'operator' });
});

test('rejects wrong credentials and expired TOTP without consuming a valid code', async () => {
  const auth = createAdminAuth({ ...options, redis: testRedis() });
  assert.equal(await auth.verify({ ...login(), username: 'other' }), null);
  assert.equal(await auth.verify({ ...login(), password: 'wrong-password-value' }), null);
  assert.equal(await auth.verify(login(moment - 120_000)), null);
  assert.deepEqual(await auth.verify(login()), { id: 'operator' });
});

test('rejects repeated codes across instances and restarts, then accepts the next code', async () => {
  const redis = testRedis();
  const auth = createAdminAuth({ ...options, redis });
  assert.deepEqual(await auth.verify(login()), { id: 'operator' });
  assert.equal(await auth.verify(login()), null);
  const restarted = createAdminAuth({ ...options, redis, now: () => moment + 30_000 });
  assert.equal(await restarted.verify(login()), null);
  assert.deepEqual(await restarted.verify(login(moment + 30_000)), { id: 'operator' });
});

test('only one concurrent login can consume the same OTP', async () => {
  const redis = testRedis();
  const first = createAdminAuth({ ...options, redis });
  const second = createAdminAuth({ ...options, redis });
  const results = await Promise.all([first.verify(login()), second.verify(login())]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('rejects older counters after accepting a future-skew code', async () => {
  const auth = createAdminAuth({ ...options, redis: testRedis() });
  assert.deepEqual(await auth.verify(login(moment + 30_000)), { id: 'operator' });
  assert.equal(await auth.verify(login()), null);
});

test('limits account attempts across instances, including failed passwords', async () => {
  const redis = testRedis();
  const auth = createAdminAuth({ ...options, redis });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(await auth.verify({ ...login(), password: 'wrong' }), null);
  assert.equal(await createAdminAuth({ ...options, redis }).verify(login()), null);
});

test('fails closed if shared replay storage is unavailable', async () => {
  const redis = { async command(parts) { if (parts.length === 5) return 1; throw new Error('Redis unavailable'); } };
  await assert.rejects(createAdminAuth({ ...options, redis }).verify(login()), /Redis unavailable/);
});

test('rejects missing storage, malformed password hashes and invalid Base32 characters', () => {
  assert.throws(() => createAdminAuth(options), /shared Redis/);
  assert.throws(() => createAdminAuth({ ...options, redis: testRedis(), passwordHash: 'scrypt:broken' }), /ADMIN_PASSWORD_HASH/);
  assert.throws(() => totpAt(secret + '!', moment), /valid Base32/);
});

test('matches the six-digit suffix of published RFC 6238 SHA-1 vectors', () => {
  const vectorSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
    assert.equal(totpAt(vectorSecret, seconds * 1000), expected);
  }
});

test('admin HTTP login issues a token once and rejects the replay without a token', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-only-bot-token', JWT_SECRET: 'p'.repeat(32),
    ADMIN_JWT_SECRET: 'a'.repeat(32), APP_ORIGIN: 'https://test.mtx.example',
    ADMIN_AUTH: createAdminAuth({ ...options, redis: testRedis() }),
  };
  const request = () => new Request('https://api.mtx.example/api/admin/auth', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: env.APP_ORIGIN }, body: JSON.stringify(login()),
  });
  const accepted = await handleRequest(request(), env);
  assert.equal(accepted.status, 200);
  assert.equal(typeof (await accepted.json()).token, 'string');
  const replayed = await handleRequest(request(), env);
  assert.equal(replayed.status, 401);
  assert.equal((await replayed.json()).token, undefined);
});
