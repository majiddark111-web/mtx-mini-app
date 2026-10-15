import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyTelegramBotIdentity } from './botIdentity.mjs';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});
const validResponse = () => response({ ok: true, result: { id: 8324814988, username: 'Tokxtapbot' } });
const noWait = { sleep: async () => {} };
const connectionError = (code = 'ETIMEDOUT') => new TypeError('https://api.telegram.org/botsecret-token/getMe', { cause: { code } });

describe('Telegram bot identity verification', () => {
  it('accepts the configured bot without exposing its token', async () => {
    let requestedUrl = '';
    const identity = await verifyTelegramBotIdentity('secret-token', '@TOKXTAPBOT', async (url) => {
      requestedUrl = String(url);
      return response({ ok: true, result: { id: 123, username: 'TOKXTAPBOT' } });
    });
    assert.deepEqual(identity, { id: '123', username: 'TOKXTAPBOT' });
    assert.match(requestedUrl, /secret-token/);
  });

  it('rejects a token belonging to another bot', async () => {
    await assert.rejects(
      verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => response({ ok: true, result: { id: 456, username: 'AnotherBot' } })),
      /belongs to @AnotherBot, not @TOKXTAPBOT/,
    );
  });

  it('rejects a token that Telegram does not recognize', async () => {
    await assert.rejects(
      verifyTelegramBotIdentity('bad-token', 'TOKXTAPBOT', async () => response({ ok: false, description: 'Unauthorized' }, 401)),
      /was rejected by Telegram/,
    );
  });

  it('reports a sanitized network failure reason', async () => {
    const networkError = new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    await assert.rejects(
      verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => { throw networkError; }, noWait),
      /UND_ERR_CONNECT_TIMEOUT/,
    );
  });

  it('recovers on the third attempt with fresh deadlines and bounded backoff', async () => {
    const signals = [];
    const pauses = [];
    const retries = [];
    const identity = await verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async (_url, options) => {
      signals.push(options.signal);
      assert.equal(options.redirect, 'error');
      if (signals.length < 3) throw connectionError();
      return validResponse();
    }, { sleep: async (delay) => { pauses.push(delay); }, onRetry: (event) => retries.push(event) });
    assert.deepEqual(identity, { id: '8324814988', username: 'Tokxtapbot' });
    assert.equal(new Set(signals).size, 3);
    assert.ok(signals.every((signal) => signal instanceof globalThis.AbortSignal));
    assert.equal(pauses.length, 2);
    assert.ok(pauses[0] >= 1000 && pauses[0] < 1250);
    assert.ok(pauses[1] >= 2000 && pauses[1] < 2250);
    assert.deepEqual(retries.map((event) => event.nextAttempt), [2, 3]);
    assert.ok(retries.every((event) => event.reason === 'ETIMEDOUT' && event.maximumAttempts === 3));
    assert.doesNotMatch(JSON.stringify(retries), /secret-token|api\.telegram/);
  });

  it('stops after exactly three network failures and preserves a safe final error', async () => {
    let attempts = 0;
    let pauses = 0;
    await assert.rejects(verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
      attempts += 1;
      throw connectionError();
    }, { sleep: async () => { pauses += 1; } }), (error) => {
      assert.match(error.message, /ETIMEDOUT.*failed after 3 attempts/);
      assert.doesNotMatch(error.stack, /secret-token|https:/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(attempts, 3);
    assert.equal(pauses, 2);
  });

  for (const status of [401, 403, 400, 429]) {
    it(`does not retry HTTP ${status}, even with a malformed response body`, async () => {
      let attempts = 0;
      let cancelled = false;
      await assert.rejects(verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
        attempts += 1;
        return { ok: false, status, body: { cancel: async () => { cancelled = true; } }, json: async () => { throw new Error('must not parse'); } };
      }, { sleep: async () => assert.fail('must not retry') }));
      assert.equal(attempts, 1);
      assert.equal(cancelled, true);
    });
  }

  for (const status of [502, 503, 504]) {
    it(`retries HTTP ${status} only after releasing the old response`, async () => {
      let attempts = 0;
      let cancelled = false;
      await verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
        attempts += 1;
        if (attempts === 1) return { ok: false, status, body: { cancel: async () => { cancelled = true; } } };
        assert.equal(cancelled, true);
        return validResponse();
      }, noWait);
      assert.equal(attempts, 2);
    });
  }

  it('does not retry an identity mismatch after a transient failure', async () => {
    let attempts = 0;
    await assert.rejects(verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
      attempts += 1;
      if (attempts === 1) throw connectionError();
      return response({ ok: true, result: { id: 456, username: 'AnotherBot' } });
    }, noWait), /belongs to @AnotherBot/);
    assert.equal(attempts, 2);
  });

  for (const code of ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ENOTFOUND', 'secret-token']) {
    it(`does not retry permanent or unknown failure ${code}`, async () => {
      let attempts = 0;
      await assert.rejects(verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
        attempts += 1;
        throw connectionError(code);
      }, { sleep: async () => assert.fail('must not retry') }), (error) => {
        assert.doesNotMatch(error.stack, /secret-token|https:/);
        return true;
      });
      assert.equal(attempts, 1);
    });
  }

  it('retries aggregate transient connection failures', async () => {
    let attempts = 0;
    await verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('fetch failed', { cause: new AggregateError([
        Object.assign(new Error(), { code: 'ENETUNREACH' }),
        Object.assign(new Error(), { code: 'ETIMEDOUT' }),
      ]) });
      return validResponse();
    }, noWait);
    assert.equal(attempts, 2);
  });

  it('retries request timeouts and interrupted response bodies', async () => {
    let attempts = 0;
    await verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
      attempts += 1;
      if (attempts === 1) throw new globalThis.DOMException('secret-token', 'TimeoutError');
      if (attempts === 2) return { ok: true, json: async () => { throw connectionError('ECONNRESET'); } };
      return validResponse();
    }, noWait);
    assert.equal(attempts, 3);
  });

  it('does not retry malformed JSON or a negative Telegram response', async () => {
    for (const makeResponse of [
      () => new Response('not JSON', { status: 200 }),
      () => response({ ok: false }),
    ]) {
      let attempts = 0;
      await assert.rejects(verifyTelegramBotIdentity('secret-token', 'TOKXTAPBOT', async () => {
        attempts += 1;
        return makeResponse();
      }, { sleep: async () => assert.fail('must not retry') }));
      assert.equal(attempts, 1);
    }
  });

  it('does not make a request when the configured username is missing', async () => {
    await assert.rejects(verifyTelegramBotIdentity('secret-token', '', async () => assert.fail('must not request')), /required/);
  });
});
