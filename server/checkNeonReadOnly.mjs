import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import pg from 'pg';
import { probeNeon, migrationReference, safeProbeFailure } from './neonReadOnlyProbe.mjs';

// Standalone opt-in command, never imported by productionServer or migrations.
const deadline = setTimeout(() => {
  process.stderr.write('MTX_NEON_READONLY_FAIL TIME_LIMIT\n');
  process.exit(1);
}, 45000);
try {
  const reference = await migrationReference();
  const summary = await probeNeon(process.env, config => new pg.Client(config), reference);
  process.stdout.write('MTX_NEON_READONLY_PASS ' + JSON.stringify(summary) + '\n');
} catch (error) {
  process.stderr.write('MTX_NEON_READONLY_FAIL ' + safeProbeFailure(error) + '\n');
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
