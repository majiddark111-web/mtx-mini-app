import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runMigrations } from './migrations.mjs';

describe('database migrations', () => {
  it('applies each version once and records its checksum', async () => {
    const applied = new Map();
    let schemaExecutions = 0;
    const database = {
      transaction: (operation) => operation(database),
      async query(sql, values = []) {
        if (sql.startsWith('SELECT version, checksum')) return { rows: [...applied].map(([version, checksum]) => ({ version, checksum })) };
        if (sql.startsWith('INSERT INTO mtx_schema_migrations')) { applied.set(Number(values[0]), String(values[2])); return { rows: [] }; }
        if (sql.includes('CREATE TABLE IF NOT EXISTS mtx_game_state')) schemaExecutions += 1;
        return { rows: [] };
      },
    };
    assert.deepEqual(await runMigrations(database), ['001_initial.sql', '002_equipped_cosmetics.sql']);
    assert.deepEqual(await runMigrations(database), []);
    assert.equal(schemaExecutions, 1);
    assert.equal(applied.size, 2);
  });
});
