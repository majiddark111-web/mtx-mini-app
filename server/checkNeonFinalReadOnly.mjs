import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import pg from 'pg';
import { probeNeonDeployment, neonDeploymentPhase, migrationReference, safeProbeFailure } from './neonReadOnlyProbe.mjs';

// Read-only deployment gate. Default: all release migrations must already be applied.
// Build uses --before-migrate to permit only new, appended migrations.
const deadline = setTimeout(() => {
  process.stderr.write('MTX_NEON_FINAL_FAIL TIME_LIMIT\n');
  process.exit(1);
}, 45000);
try {
  const phase = neonDeploymentPhase(process.argv.slice(2));
  const summary = await probeNeonDeployment(process.env, config => new pg.Client(config), await migrationReference(), phase);
  process.stdout.write('MTX_NEON_FINAL_PASS ' + JSON.stringify(summary) + '\n');
} catch (error) {
  process.stderr.write('MTX_NEON_FINAL_FAIL ' + safeProbeFailure(error) + '\n');
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
