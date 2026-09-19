import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appOrigin, portableEnvironment, walletManifest } from './deployment/config.mjs';
import { initializeDeployment } from './deployment/initialize.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('portable infrastructure safeguards', () => {
  it('ships the shared economy module to both frontend and backend images', async () => {
    const dockerfile = await readFile(new URL('../deploy/Dockerfile', import.meta.url), 'utf8');
    const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
    assert.equal(dockerfile.match(/COPY economy \.\/economy/g)?.length, 2);
    assert.match(ignore, /!economy\/\*\*/);
  });
  it('creates separate credentials once without replacing existing files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mtx-deploy-test-'));
    try {
      assert.deepEqual(await initializeDeployment(directory, 'play.mtx.test'), { filesCreated: 5 });
      const path = join(directory, 'secrets', 'api.json');
      const original = await readFile(path, 'utf8');
      const config = JSON.parse(original);
      assert.match(config.JWT_SECRET, /^[a-f0-9]{64}$/);
      assert.notEqual(config.JWT_SECRET, config.ADMIN_JWT_SECRET);
      const app = await readFile(join(directory, 'secrets', 'postgres-password'), 'utf8');
      const admin = await readFile(join(directory, 'secrets', 'postgres-admin-password'), 'utf8');
      const redis = await readFile(join(directory, 'secrets', 'redis-password'), 'utf8');
      assert.equal(new Set([app, admin, redis]).size, 3);
      await assert.rejects(initializeDeployment(directory, 'other.mtx.test'), /already exists/);
      assert.equal(await readFile(path, 'utf8'), original);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('leaves a pre-existing deployment environment untouched', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mtx-deploy-test-'));
    try {
      await writeFile(join(directory, '.env'), 'existing');
      await assert.rejects(initializeDeployment(directory, 'play.mtx.test'), /already exists/);
      assert.equal(await readFile(join(directory, '.env'), 'utf8'), 'existing');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('exposes no database or cache host ports and mounts only public CA in API', async () => {
    const config = await readFile(new URL('../deploy/compose.self-hosted.yaml', import.meta.url), 'utf8');
    assert.doesNotMatch(config, /ports:/);
    assert.match(config, /postgres_data:\/var\/lib\/postgresql/);
    const api = config.split('\n  api:')[1].split('\nsecrets:')[0];
    assert.match(api, /NODE_EXTRA_CA_CERTS/);
    assert.doesNotMatch(api, /tls_authority|tls_postgres|tls_redis|postgres_admin_password/);
  });
  it('preserves TLS, durable Redis and a non-superuser application role', async () => {
    const redis = await readFile(new URL('../deploy/redis-start.sh', import.meta.url), 'utf8');
    assert.match(redis, /port 0\ntls-port 6379/);
    assert.match(redis, /appendfsync always/);
    assert.match(redis, /maxmemory-policy noeviction/);
    const postgres = await readFile(new URL('../deploy/postgres-init.sh', import.meta.url), 'utf8');
    assert.match(postgres, /NOSUPERUSER NOCREATEDB NOCREATEROLE/);
  });
  it('restore requires confirmation, an empty destination and stopped writers', async () => {
    const script = await readFile(new URL('../deploy/mtx.sh', import.meta.url), 'utf8');
    assert.match(script, /EMPTY_MTX_DATABASE/);
    assert.match(script, /Stop API and web before restoring/);
    assert.match(script, /Destination is not empty/);
    assert.match(script, /--single-transaction --exit-on-error --no-owner --no-privileges/);
    assert.doesNotMatch(script, /--clean|down --volumes|down -v/);
  });
});
