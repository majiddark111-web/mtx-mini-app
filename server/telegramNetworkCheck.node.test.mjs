import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { errorCodes, probeFetch, probeHttps } from './telegramNetworkCheck.mjs';

test('diagnostics expose only safe nested error codes, never messages or URLs', () => {
  const error = new AggregateError([
    Object.assign(new Error('https://example.com/secret-token'), { code: 'ETIMEDOUT' }),
    { code: 'https://example.com/secret-token' },
  ], 'secret-token', { cause: { code: 'ENETUNREACH' } });
  assert.deepEqual(errorCodes(error), ['ENETUNREACH', 'ETIMEDOUT']);
  error.cause = error;
  assert.doesNotThrow(() => errorCodes(error));
});

test('fetch probe does not follow redirects and accepts any HTTP status as connectivity', async () => {
  let cancelled = false;
  const result = await probeFetch('https://api.telegram.org/', async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/');
    assert.equal(options.method, 'HEAD');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof globalThis.AbortSignal);
    assert.equal(options.headers, undefined);
    return { status: 302, body: { cancel: async () => { cancelled = true; } } };
  });
  assert.equal(result.reachable, true);
  assert.equal(result.status, 302);
  assert.equal(cancelled, true);
});

test('fetch probe reports connection errors without throwing or revealing secrets', async () => {
  const result = await probeFetch('https://api.telegram.org/', async () => {
    throw new TypeError('secret-token', { cause: { code: 'ETIMEDOUT' } });
  });
  assert.equal(result.reachable, false);
  assert.deepEqual(result.codes, ['ETIMEDOUT']);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('HTTPS probe forces requested family, keeps TLS verification and closes response', async () => {
  let destroyed = false;
  const result = await probeHttps('https://api.telegram.org/', 4, (url, options, callback) => {
    assert.equal(url, 'https://api.telegram.org/');
    assert.equal(options.family, 4);
    assert.notEqual(options.rejectUnauthorized, false);
    assert.equal(options.agent, false);
    const request = new EventEmitter();
    request.end = () => {
      const socket = new EventEmitter();
      request.emit('socket', socket);
      socket.emit('lookup', null);
      socket.emit('connect');
      socket.emit('secureConnect');
      callback({ statusCode: 405, destroy: () => { destroyed = true; } });
    };
    return request;
  });
  assert.equal(result.reachable, true);
  assert.equal(result.status, 405);
  assert.equal(result.stage, 'http');
  assert.equal(destroyed, true);
});

test('HTTPS probe bounds timeout, destroys request and retains last connection stage', async () => {
  let destroyed = false;
  const result = await probeHttps('https://api.telegram.org/', 6, () => {
    const request = new EventEmitter();
    request.end = () => {
      const socket = new EventEmitter();
      request.emit('socket', socket);
      socket.emit('lookup', null);
    };
    request.destroy = () => { destroyed = true; request.emit('error', { code: 'ECONNRESET' }); };
    return request;
  }, 10);
  assert.equal(result.reachable, false);
  assert.deepEqual(result.codes, ['DEADLINE_EXCEEDED']);
  assert.equal(result.stage, 'tcp');
  assert.equal(destroyed, true);
});

test('HTTPS probe handles synchronous setup errors without throwing', async () => {
  const result = await probeHttps('https://api.telegram.org/', 4, () => { throw new Error('secret-token'); });
  assert.equal(result.reachable, false);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});
