import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { portableEnvironment } from './config.mjs';

try {
  const input = JSON.parse(await readFile('/run/secrets/api_config', 'utf8'));
  if (process.env.MTX_SELF_HOSTED === 'true') {
    const postgresPassword = (await readFile('/run/secrets/postgres_password', 'utf8')).trim();
    const redisPassword = (await readFile('/run/secrets/redis_password', 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(postgresPassword) || !/^[a-f0-9]{64}$/.test(redisPassword)) throw new Error('Invalid generated infrastructure credentials');
    input.DATABASE_URL = `postgresql://mtx:${postgresPassword}@postgres:5432/mtx`;
    input.REDIS_URL = `rediss://default:${redisPassword}@redis:6379`;
  }
  Object.assign(process.env, portableEnvironment(input, process.env.MTX_DOMAIN, process.env.MTX_BOT_USERNAME));
} catch {
  process.stderr.write('MTX configuration rejected. Run the documented preflight; secret values are not logged.\n');
  process.exit(1);
}
const mode = process.argv[2] ?? 'serve';
if (mode === 'serve') await import('../productionServer.mjs');
else if (mode === 'migrate') await import('../migrate.mjs');
else if (mode === 'check') process.stdout.write('MTX_PORTABLE_CONFIG_OK\n');
else throw new Error('Supported modes: serve, migrate, check');
