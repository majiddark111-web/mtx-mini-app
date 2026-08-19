import pg from 'pg';
import { createClient } from 'redis';

const positiveInteger = (value, fallback, name) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

export async function createNodeInfrastructure(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL ?? environment.POSTGRES_URL;
  const redisUrl = environment.REDIS_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!redisUrl) throw new Error('REDIS_URL is required');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) throw new Error('DATABASE_URL must use PostgreSQL');
  if (environment.NODE_ENV === 'production' && environment.POSTGRES_SSL === 'false') throw new Error('Production PostgreSQL must use TLS');
  if (!redisUrl.startsWith('rediss://') && environment.NODE_ENV === 'production') throw new Error('Production REDIS_URL must use TLS (rediss://)');

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: environment.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: environment.POSTGRES_TLS_REJECT_UNAUTHORIZED !== 'false' },
    max: positiveInteger(environment.POSTGRES_POOL_MAX, 10, 'POSTGRES_POOL_MAX'),
    connectionTimeoutMillis: positiveInteger(environment.POSTGRES_CONNECT_TIMEOUT_MS, 30_000, 'POSTGRES_CONNECT_TIMEOUT_MS'),
    idleTimeoutMillis: positiveInteger(environment.POSTGRES_IDLE_TIMEOUT_MS, 30_000, 'POSTGRES_IDLE_TIMEOUT_MS'),
    application_name: 'mtx-api',
  });
  pool.on('error', (error) => process.stderr.write(`PostgreSQL pool error: ${error.message}\n`));

  const redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: positiveInteger(environment.REDIS_CONNECT_TIMEOUT_MS, 30_000, 'REDIS_CONNECT_TIMEOUT_MS'),
      reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 5), 5_000),
    },
  });
  redisClient.on('error', (error) => process.stderr.write(`Redis client error: ${error.message}\n`));

  try {
    await Promise.all([pool.query('SELECT 1'), redisClient.connect()]);
  } catch (error) {
    await Promise.allSettled([pool.end(), redisClient.isOpen ? redisClient.disconnect() : Promise.resolve()]);
    throw error;
  }

  const postgres = {
    query: (sql, values = []) => pool.query(sql, values),
    transaction: async (operation) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await operation({ query: (sql, values = []) => client.query(sql, values) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
  const redis = { command: (parts) => redisClient.sendCommand(parts) };

  return {
    postgres,
    redis,
    async health() { await Promise.all([pool.query('SELECT 1'), redisClient.ping()]); },
    async close() { await Promise.allSettled([pool.end(), redisClient.isOpen ? redisClient.quit() : Promise.resolve()]); },
  };
}
