import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyTelegramBotIdentity } from './botIdentity.mjs';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

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
});
