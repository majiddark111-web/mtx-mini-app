import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { checkServerIdentity } from 'node:tls';

const host = 'ep-shy-frost-aoj2cl9v.c-2.ap-southeast-1.aws.neon.tech';
const fail = () => { throw new Error('NEON_PROBE_CONFIG'); };

export function neonProbeConfig(environment) {
  // Never fall back to the active DATABASE_URL, PG* settings, or URL TLS flags.
  const raw = environment.MTX_NEON_PROBE_URL?.trim();
  if (!raw) fail();
  let url;
  try { url = new URL(raw); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
      (url.port && url.port !== '5432') || url.pathname !== '/neondb' ||
      url.username !== 'neondb_owner' || !url.password || url.hash) fail();
  for (const [key, value] of url.searchParams) {
    if (!((key === 'sslmode' && ['require', 'verify-full'].includes(value)) ||
          (key === 'channel_binding' && value === 'require'))) fail();
  }
  let password;
  try { password = decodeURIComponent(url.password); } catch { fail(); }
  return {
    host, port: 5432, database: 'neondb', user: 'neondb_owner', password,
    ssl: { rejectUnauthorized: true, servername: host, minVersion: 'TLSv1.2' },
    enableChannelBinding: true,
    application_name: 'mtx-neon-readonly-probe',
    options: '-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000',
    connectionTimeoutMillis: 15000, query_timeout: 12000,
  };
}

function verifyNeonTls(client) {
  // pg's Node transport exposes the client-to-proxy TLSSocket here after connect.
  // pg_stat_ssl describes the separate proxy-to-Postgres connection, not this hop.
  const socket = client.connection?.stream;
  if (socket?.encrypted !== true || socket.authorized !== true || socket.authorizationError ||
      !['TLSv1.2', 'TLSv1.3'].includes(socket.getProtocol?.()) ||
      typeof socket.getPeerCertificate !== 'function') throw new Error('NEON_PROBE_TLS');
  try {
    if (checkServerIdentity(host, socket.getPeerCertificate())) throw new Error('NEON_PROBE_TLS');
  } catch {
    // Never include certificate details, hostname errors, or arbitrary driver errors in logs.
    throw new Error('NEON_PROBE_TLS');
  }
}

export async function migrationReference() {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(files.map(async name => ({
    version: Number(name.slice(0, 3)), name,
    checksum: createHash('sha256').update((await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n')).digest('hex'),
  })));
}

export async function probeNeon(environment, makeClient, reference) {
  const client = makeClient(neonProbeConfig(environment));
  // Idle connection errors must not print connection details via an uncaught event.
  let idleError = false;
  client.on('error', () => { idleError = true; });
  try {
    await client.connect();
    verifyNeonTls(client);
    await client.query('BEGIN READ ONLY');
    const { rows: [identity] } = await client.query(`SELECT current_database() AS db,
      current_user AS role, current_setting('server_version_num')::int AS version,
      current_setting('transaction_read_only') AS readonly`);
    if (identity?.db !== 'neondb' || identity.role !== 'neondb_owner' ||
        identity.version < 180000 || identity.version >= 190000 ||
        identity.readonly !== 'on') throw new Error('NEON_PROBE_IDENTITY');
    const { rows: migrations } = await client.query('SELECT version, name, checksum FROM public.mtx_schema_migrations ORDER BY version');
    if (JSON.stringify(migrations) !== JSON.stringify(reference)) throw new Error('NEON_PROBE_SCHEMA');
    const { rows: [status] } = await client.query(`SELECT
      (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mtx_daily_claims'::regclass
        AND tgname='mtx_archive_daily_reward' AND tgenabled='O' AND NOT tgisinternal) AS trigger,
      (SELECT count(*)::int FROM public.mtx_daily_reward_history WHERE claimed_at IS NULL) AS legacy,
      (SELECT count(*)::int FROM public.mtx_daily_reward_history WHERE claimed_at IS NOT NULL) AS timed`);
    if (status?.tables !== 20 || !status.trigger || status.legacy < 1 || status.timed < 1) throw new Error('NEON_PROBE_DATA');
    if (idleError) throw new Error('NEON_PROBE_CONNECTION');
    await client.query('ROLLBACK');
    return { tls: true, readonly: true, tables: 20, migrations: reference.length, rewardTrigger: true };
  } finally {
    // Disconnect also rolls back on failed queries; never run a write or migration.
    await client.end();
  }
}

export function safeProbeFailure(error) {
  const allowed = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH',
    '28P01', '3D000', '42501', '42P01', '57014', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']);
  if (allowed.has(error?.code)) return error.code;
  return ['NEON_PROBE_CONFIG', 'NEON_PROBE_TLS', 'NEON_PROBE_IDENTITY', 'NEON_PROBE_SCHEMA', 'NEON_PROBE_DATA',
    'NEON_PROBE_CONNECTION'].includes(error?.message) ? error.message : 'CONNECTION_OR_QUERY_FAILED';
}
