import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import pg from 'pg';
import { probeFinalNeon, migrationReference, safeProbeFailure } from './neonReadOnlyProbe.mjs';

// Explicit cutover gate: no migrations, Redis access, or application startup here.
const deadline = setTimeout(() => {
  process.stderr.write('MTX_NEON_FINAL_FAIL TIME_LIMIT\n');
  process.exit(1);
}, 45000);
try {
  const summary = await probeFinalNeon(process.env, config => new pg.Client(config), await migrationReference());
  process.stdout.write('MTX_NEON_FINAL_PASS ' + JSON.stringify(summary) + '\n');
} catch (error) {
  process.stderr.write('MTX_NEON_FINAL_FAIL ' + safeProbeFailure(error) + '\n');
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
