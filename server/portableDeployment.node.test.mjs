import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appOrigin, portableEnvironment, walletManifest } from './deployment/config.mjs';

const input = () => ({ TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(35)}`, JWT_SECRET: 'a'.repeat(64), ADMIN_JWT_SECRET: 'b'.repeat(64), ADMIN_USERNAME: 'operator', ADMIN_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, ADMIN_TOTP_SECRET: 'A'.repeat(32), DATABASE_URL: 'postgresql://mtx:password@postgres:5432/mtx', REDIS_URL: 'rediss://default:password@redis:6379', TONCENTER_API_KEY: 'test-key', TON_TREASURY_ADDRESS: 'test-address' });
describe('portable deployment configuration', () => {
  it('generates a same-origin MTX manifest without a Render address', () => {
    assert.deepEqual(walletManifest('PLAY.MTX.TEST'), { name: 'MTX', url: 'https://play.mtx.test', iconUrl: 'https://play.mtx.test/mtx.png' });
  });
  it('rejects placeholders, paths, ports and configuration injection in domain', () => {
    for (const domain of ['https://mtx.test', 'game.example.com', 'mtx.test:443', 'mtx.test/foo', 'mtx.test\nrespond hacked', '-bad.test']) assert.throws(() => appOrigin(domain));
  });
  it('keeps production TLS and Testnet explicit', () => {
    const result = portableEnvironment(input(), 'play.mtx.test', 'TOKXTAPBOT');
    assert.equal(result.POSTGRES_TLS_REJECT_UNAUTHORIZED, 'true');
    assert.equal(result.NODE_ENV, 'production');
    assert.equal(result.TONCENTER_BASE_URL, 'https://testnet.toncenter.com');
    assert.equal(result.APP_ORIGIN, 'https://play.mtx.test');
  });
  it('rejects shared JWT secrets, partial admin credentials and placeholder secrets', () => {
    for (const change of [{ ADMIN_JWT_SECRET: 'a'.repeat(64) }, { ADMIN_TOTP_SECRET: '' }, { JWT_SECRET: 'REPLACE_WITH_SECRET' }, { TELEGRAM_BOT_TOKEN: '@tokxtapbot' }]) assert.throws(() => portableEnvironment({ ...input(), ...change }, 'play.mtx.test', 'TOKXTAPBOT'));
  });
  it('rejects mainnet and transport overrides rather than weakening TLS', () => {
    for (const change of [{ TONCENTER_BASE_URL: 'https://toncenter.com' }, { POSTGRES_SSL: 'false' }, { REDIS_URL: 'redis://default:password@redis:6379' }, { DATABASE_URL: 'postgresql://mtx:password@postgres/mtx?sslmode=disable' }]) assert.throws(() => portableEnvironment({ ...input(), ...change }, 'play.mtx.test', 'TOKXTAPBOT'));
  });
  it('rejects invalid economic parameters', () => {
    for (const value of ['0', '-1', 'NaN', '1.2']) assert.throws(() => portableEnvironment({ ...input(), TON_PAYMENT_CREDIT_MTX: value }, 'play.mtx.test', 'TOKXTAPBOT'));
  });
  it('proxy protects source IP and does not strip signed API paths', async () => {
    const config = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
    assert.match(config, /header_up CF-Connecting-IP \{remote_host\}/);
    assert.match(config, /header_up X-Forwarded-For \{remote_host\}/);
    assert.doesNotMatch(config, /handle_path/);
    assert.match(config, /max_size 128KB/);
  });
});
