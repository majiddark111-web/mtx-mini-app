import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { RedisRateLimiter } from '../src/rateLimiter.ts';

// Never fall back to REDIS_URL: that variable may identify production.
export function localRedisTestUrl(env) {
  if (env.MTX_LOCAL_REDIS_TEST_ALLOW_WRITE !== 'true') throw new Error('LOCAL_REDIS_OPT_IN_REQUIRED');
  let url;
  try { url = new URL(env.MTX_LOCAL_REDIS_TEST_URL); }
  catch { throw new Error('LOCAL_REDIS_CONFIG_INVALID'); }
  if (url.protocol !== 'redis:' || url.hostname !== '127.0.0.1' || url.port !== '56379'
    || url.username || url.password || url.search || url.hash || !['', '/', '/0'].includes(url.pathname)) {
    throw new Error('LOCAL_REDIS_CONFIG_INVALID');
  }
  return url.href;
}

export async function runLocalRedisRateLimitTest(env = process.env) {
  const url = localRedisTestUrl(env);
  const prefix = `mtx_local_rate_test:${randomUUID()}`;
  const names = ['burst', 'other', 'repair', 'invalid'];
  const keys = names.map(name => `${prefix}:${name}`);
  const client = createClient({ url, socket: { reconnectStrategy: false, connectTimeout: 3000 } });
  client.on('error', () => {}); // The awaited operation reports failure; never log connection details.
  let ownsKeys = false;
  try {
    await client.connect();
    assert.equal(await client.exists(keys), 0, 'Unexpected key collision');
    ownsKeys = true;
    const redis = { command: parts => client.sendCommand(parts) };
    const limiter = new RedisRateLimiter(redis, 7, 30000, prefix);

    // Exercise the actual Lua atomically under concurrent requests.
    const results = await Promise.all(Array.from({ length: 100 }, () => limiter.consumeWithDelay('burst')));
    assert.equal(results.filter(value => value === 0).length, 7);
    assert.equal(results.filter(value => value > 0 && value <= 30000).length, 93);
    assert.equal(await client.get(keys[0]), '100');
    assert.equal(await limiter.consume('other'), true, 'Separate buckets must remain independent');

    // A refusal must report the existing TTL rather than opening a new window.
    await client.pExpire(keys[0], 5000);
    const before = await client.pTTL(keys[0]);
    const refused = await limiter.consumeWithDelay('burst');
    const after = await client.pTTL(keys[0]);
    assert.ok(after > 0 && after <= refused && refused <= before);
    assert.equal(await limiter.consume('burst'), false);

    // Test real expiry, not an injected application clock.
    await client.pExpire(keys[0], 80);
    await delay(150);
    assert.equal(await limiter.consume('burst'), true);
    assert.equal(await client.get(keys[0]), '1');
    assert.ok(await client.pTTL(keys[0]) > 0);

    // Repair a pre-existing counter without a TTL, preserving its quota.
    await client.set(keys[2], '7');
    assert.equal(await client.pTTL(keys[2]), -1);
    assert.ok(await limiter.consumeWithDelay('repair') > 0);
    assert.ok(await client.pTTL(keys[2]) > 0);

    // Redis errors must reject, never grant a request silently.
    await client.set(keys[3], 'not-an-integer');
    await assert.rejects(() => limiter.consume('invalid'));
    await client.del(keys);
    assert.equal(await client.exists(keys), 0);
    ownsKeys = false;
    await client.quit();
    await assert.rejects(() => limiter.consume('burst'));
    process.stdout.write('MTX_LOCAL_REDIS_RATE_PASS: concurrent quota, independent buckets, TTL, expiry, repair, fail-closed, cleanup\n');
  } finally {
    try {
      if (ownsKeys && client.isReady) {
        await client.del(keys); // Only this run\'s four UUID-scoped keys; never FLUSHDB/FLUSHALL.
        assert.equal(await client.exists(keys), 0);
      } else if (ownsKeys) {
        process.stderr.write('MTX_LOCAL_REDIS_CLEANUP_NOT_VERIFIED\n');
      }
    } finally {
      if (client.isOpen) client.destroy();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalRedisRateLimitTest().catch(() => {
    process.stderr.write('MTX_LOCAL_REDIS_RATE_FAIL: check local test configuration and isolated Redis availability\n');
    process.exitCode = 1;
  });
}
