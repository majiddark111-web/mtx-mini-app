import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuth, hashAdminPassword, totpAt } from './adminCredentials.mjs';

const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
test('verifies a hashed admin password and current TOTP', async () => { const now = 1_800_000_000_000; const auth = createAdminAuth({ username: 'operator', passwordHash: hashAdminPassword('a-long-admin-password'), totpSecret: secret, now: () => now }); assert.deepEqual(await auth.verify({ username: 'operator', password: 'a-long-admin-password', otp: totpAt(secret, now) }), { id: 'operator' }); });
test('rejects a wrong password or expired TOTP', async () => { const now = 1_800_000_000_000; const auth = createAdminAuth({ username: 'operator', passwordHash: hashAdminPassword('a-long-admin-password'), totpSecret: secret, now: () => now }); assert.equal(await auth.verify({ username: 'operator', password: 'wrong-password-value', otp: totpAt(secret, now) }), null); assert.equal(await auth.verify({ username: 'operator', password: 'a-long-admin-password', otp: totpAt(secret, now - 120_000) }), null); });
