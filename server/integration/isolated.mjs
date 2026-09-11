import { fileURLToPath } from 'node:url';

try {
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL) || !process.env.REDIS_URL) throw new Error('ISOLATED_CONNECTION_CONFIG_MISSING');
  // This entry point always substitutes its own isolated provider, never the
  // default unscoped provider or a caller-supplied infrastructure module.
  process.env.MTX_INTEGRATION_ALLOW_WRITE = 'true';
  process.env.MTX_INFRASTRUCTURE_MODULE = fileURLToPath(new URL('./isolatedProvider.mjs', import.meta.url));
  await import('./run.mjs');
  process.stdout.write('MTX_ISOLATED_TEST_PASS_AND_CLEAN\n');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CHECK_LOGS';
  process.stderr.write('MTX_ISOLATED_TEST_FAILED ' + (error?.message === 'ISOLATED_CONNECTION_CONFIG_MISSING' ? error.message : code) + '\n');
  process.exitCode = 1;
}
