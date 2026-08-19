import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/;
const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

export async function runMigrations(postgres, migrationsUrl = new URL('./migrations/', import.meta.url)) {
  if (!postgres?.transaction) throw new Error('PostgreSQL transactions are required for migrations');
  const directory = fileURLToPath(migrationsUrl);
  const files = (await readdir(directory)).filter((file) => migrationPattern.test(file)).sort();
  if (!files.length) throw new Error('No database migrations found');

  return postgres.transaction(async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(hashtext('mtx-schema-migrations'))", []);
    await database.query('CREATE TABLE IF NOT EXISTS mtx_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())', []);
    const applied = await database.query('SELECT version, checksum FROM mtx_schema_migrations ORDER BY version', []);
    const appliedByVersion = new Map(applied.rows.map((row) => [Number(row.version), String(row.checksum)]));
    const completed = [];

    for (const file of files) {
      const version = Number(file.slice(0, 3));
      const sql = await readFile(new URL(file, migrationsUrl), 'utf8');
      const digest = checksum(sql);
      const existing = appliedByVersion.get(version);
      if (existing && existing !== digest) throw new Error(`Migration ${file} checksum does not match the applied version`);
      if (existing) continue;
      await database.query(sql, []);
      await database.query('INSERT INTO mtx_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [version, file, digest]);
      completed.push(file);
    }
    return completed;
  });
}
