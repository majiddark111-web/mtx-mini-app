import { runIsolatedLoad } from './loadRun.mjs';

try {
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL) || !process.env.REDIS_URL) throw new Error('ISOLATED_CONNECTION_CONFIG_MISSING');
  // No arbitrary target URL, provider override, or production HTTP traffic.
  const provider = await import('./isolatedProvider.mjs');
  process.stdout.write('MTX_LOAD_PROFILE users=1,5,10 rounds=5 intervalMs=2000 maxInFlight=20 postgresPool=2\n');
  await runIsolatedLoad(provider, { onStage: (report) => process.stdout.write('MTX_LOAD_STAGE ' + JSON.stringify(report) + '\n') });
  process.stdout.write('MTX_ISOLATED_LOAD_PASS_AND_CLEAN\n');
} catch (error) {
  const safe = new Set(['ISOLATED_CONNECTION_CONFIG_MISSING', 'LOAD_CORRECTNESS_FAILED', 'LOAD_LATENCY_BUDGET_EXCEEDED', 'LOAD_SCHEDULING_BUDGET_EXCEEDED', 'ISOLATED_CLEANUP_REQUIRES_ATTENTION']);
  process.stderr.write('MTX_ISOLATED_LOAD_FAILED ' + (safe.has(error?.message) ? error.message : 'CHECK_LOGS') + '\n');
  process.exitCode = 1;
}
