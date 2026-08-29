import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTelegramStartParameter } from './telegramService.ts';

describe('Telegram referral launch parameter', () => {
  it('reads a signed MTX referral code from initData', () => {
    const initData = new URLSearchParams({ auth_date: '1', start_param: 'MTX-6844162146', hash: 'a'.repeat(64) }).toString();
    assert.equal(getTelegramStartParameter(initData), 'MTX-6844162146');
  });

  it('rejects malformed launch parameters', () => {
    assert.equal(getTelegramStartParameter('start_param=https%3A%2F%2Fevil.test'), '');
  });
});
