import { randomUUID } from 'node:crypto';
import { createNodeInfrastructure } from '../nodeInfrastructure.mjs';
import { createIsolatedScope } from './isolatedInfrastructure.mjs';

const runId = randomUUID();
process.stdout.write('MTX_ISOLATED_SCOPE schema=mtx_test_' + runId.replaceAll('-', '') + ' redis=mtx:test:' + runId + ':\n');
const infrastructure = await createNodeInfrastructure({ ...process.env, POSTGRES_POOL_MAX: '2' });
let scope;
try { scope = await createIsolatedScope(infrastructure, { runId }); }
catch {
  await infrastructure.close();
  throw new Error('ISOLATED_SETUP_FAILED; inspect the logged scope if setup was interrupted');
}
export const postgres = scope.postgres;
export const redis = scope.redis;
let closing;
export const close = () => {
  closing ??= (async () => {
    try {
      await scope.close();
      process.stdout.write('MTX_ISOLATED_CLEANUP_OK schema removed; test Redis keys verified absent\n');
    } catch {
      process.stderr.write('MTX_ISOLATED_CLEANUP_FAILED schema=' + scope.schema + ' redis=' + scope.redisPrefix + '\n');
      throw new Error('ISOLATED_CLEANUP_REQUIRES_ATTENTION');
    } finally { await infrastructure.close(); }
  })();
  return closing;
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void close().then(() => process.exit(130)).catch(() => process.exit(1));
});
