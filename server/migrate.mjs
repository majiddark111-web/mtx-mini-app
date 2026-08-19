import process from 'node:process';
import { createNodeInfrastructure } from './nodeInfrastructure.mjs';
import { runMigrations } from './migrations.mjs';

const infrastructure = await createNodeInfrastructure(process.env);
try {
  const applied = await runMigrations(infrastructure.postgres);
  process.stdout.write(applied.length ? `Applied migrations: ${applied.join(', ')}\n` : 'Database schema is up to date\n');
} finally {
  await infrastructure.close();
}
