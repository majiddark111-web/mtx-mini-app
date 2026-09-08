import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLoginError } from './adminLoginError.ts';

test('admin login distinguishes network, credentials, rate limits and unavailable service', () => {
  assert.match(adminLoginError({ isAxiosError: true }), /NETWORK/);
  for (const [status, expected] of [[400, /6-digit/], [401, /new authenticator code/], [403, /APP_ORIGIN/], [404, /API address/], [429, /Wait 60 seconds/], [503, /MTX admin auth/], [500, /server error/]] as const) {
    const message = adminLoginError({ isAxiosError: true, response: { status, data: { error: 'private-server-detail' } } });
    assert.match(message, expected);
    assert.ok(!message.includes('private-server-detail'));
  }
});
