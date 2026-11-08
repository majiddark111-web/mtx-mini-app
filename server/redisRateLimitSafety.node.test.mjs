import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRedisTestUrl } from './integration/redisRateLimit.mjs';

const config = value => ({ MTX_LOCAL_REDIS_TEST_ALLOW_WRITE: 'true', MTX_LOCAL_REDIS_TEST_URL: value });

test('local Redis test requires explicit opt-in and never uses production REDIS_URL', () => {
  assert.throws(() => localRedisTestUrl({ REDIS_URL: 'redis://127.0.0.1:56379' }));
  assert.throws(() => localRedisTestUrl({ MTX_LOCAL_REDIS_TEST_ALLOW_WRITE: 'true', REDIS_URL: 'redis://127.0.0.1:56379' }));
  assert.throws(() => localRedisTestUrl({ MTX_LOCAL_REDIS_TEST_URL: 'redis://127.0.0.1:56379' }));
});

test('local Redis test accepts only the dedicated loopback port and default database', () => {
  for (const path of ['', '/', '/0']) assert.ok(localRedisTestUrl(config(`redis://127.0.0.1:56379${path}`)));
  for (const value of [
    'redis://production.example:56379', 'redis://localhost:56379',
    'redis://127.0.0.1:6379', 'rediss://127.0.0.1:56379',
    'redis://127.0.0.1:56379/1', 'redis://user:secret@127.0.0.1:56379',
    'redis://127.0.0.1:56379?url=other', 'redis://127.0.0.1:56379#other', '',
  ]) assert.throws(() => localRedisTestUrl(config(value)), /LOCAL_REDIS_CONFIG_INVALID/);
});
