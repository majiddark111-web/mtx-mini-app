import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { checkServerIdentity } from 'node:tls';

const host = 'ep-shy-frost-aoj2cl9v.c-2.ap-southeast-1.aws.neon.tech';
const fail = () => { throw new Error('NEON_PROBE_CONFIG'); };

export function neonProbeConfig(environment) {
  // Never fall back to the active DATABASE_URL, PG* settings, or URL TLS flags.
  return targetConfig(environment.MTX_NEON_PROBE_URL?.trim(), 'neondb', false);
}

export function neonFinalProbeConfig(environment) {
  // Final cutover deliberately validates the app's effective URL, not the rehearsal secret.
  if (environment.POSTGRES_SSL === 'false' || environment.POSTGRES_TLS_REJECT_UNAUTHORIZED === 'false') fail();
  const raw = environment.DATABASE_URL;
  if (typeof raw !== 'string' || raw !== raw.trim()) fail();
  return targetConfig(raw, 'mtx_final_20261101', true);
}

function targetConfig(raw, database, finalTarget) {
  if (!raw) fail();
  let url;
  try { url = new URL(raw); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
      (url.port && url.port !== '5432') || url.pathname !== '/' + database ||
      url.username !== 'neondb_owner' || !url.password || url.hash) fail();
  for (const [key, value] of url.searchParams) {
    if (!((key === 'sslmode' && ['require', 'verify-full'].includes(value)) ||
          (key === 'channel_binding' && value === 'require'))) fail();
  }
  if (finalTarget && (url.searchParams.getAll('sslmode').length !== 1 ||
      url.searchParams.get('sslmode') !== 'verify-full')) fail();
  let password;
  try { password = decodeURIComponent(url.password); } catch { fail(); }
  return {
    host, port: 5432, database, user: 'neondb_owner', password,
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
  return probeTarget(neonProbeConfig(environment), makeClient, reference);
}

export async function probeFinalNeon(environment, makeClient, reference) {
  const config = neonFinalProbeConfig(environment);
  const summary = await probeTarget(config, makeClient, reference);
  return { database: config.database, ...summary };
}

const establishedTables = Object.freeze([
  'mtx_admin_bans', 'mtx_admin_logs', 'mtx_anti_cheat_anomalies', 'mtx_challenge_claims',
  'mtx_daily_claims', 'mtx_daily_reward_history', 'mtx_equipped_cosmetics', 'mtx_events',
  'mtx_game_state', 'mtx_inventory', 'mtx_mission_claims', 'mtx_notification_read_state',
  'mtx_notifications', 'mtx_payment_intents', 'mtx_payments', 'mtx_purchases',
  'mtx_referrals', 'mtx_schema_migrations', 'mtx_tap_events', 'mtx_tap_receipts',
]);

export function neonDeploymentPhase(args) {
  if (args.length === 0) return 'startup';
  if (args.length === 1 && args[0] === '--before-migrate') return 'before-migrate';
  fail();
}

export async function probeNeonDeployment(environment, makeClient, reference, phase = 'startup') {
  if (!['before-migrate', 'startup'].includes(phase)) fail();
  // This guard protects the established database; it must not bootstrap an empty one.
  if (!Array.isArray(reference) || reference.length < 6 || reference.some((row, index) =>
    row?.version !== index + 1 || !/^\d{3}_[a-z0-9_]+\.sql$/.test(row.name) ||
    Number(row.name.slice(0, 3)) !== row.version || !/^[a-f0-9]{64}$/.test(row.checksum))) {
    throw new Error('NEON_PROBE_SCHEMA');
  }
  const config = neonFinalProbeConfig(environment);
  return { database: config.database, phase, ...await probeTarget(config, makeClient, reference, phase) };
}

function verifyAppliedMigrations(applied, reference, phase) {
  // Before migration, only an unchanged, ordered prefix may be present.
  // Startup requires the entire release, blocking partial upgrades and old-code rollbacks.
  if (applied.length < 6 || applied.length > reference.length ||
      (phase === 'startup' && applied.length !== reference.length) ||
      applied.some((row, index) => ['version', 'name', 'checksum'].some(key => row[key] !== reference[index][key]))) {
    throw new Error('NEON_PROBE_SCHEMA');
  }
}

async function probeTarget(config, makeClient, reference, phase = 'cutover') {
  const client = makeClient(config);
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
    if (identity?.db !== config.database || identity.role !== 'neondb_owner' ||
        identity.version < 180000 || identity.version >= 190000 ||
        identity.readonly !== 'on') throw new Error('NEON_PROBE_IDENTITY');
    const { rows: migrations } = await client.query('SELECT version, name, checksum FROM public.mtx_schema_migrations ORDER BY version');
    if (phase !== 'cutover') {
      verifyAppliedMigrations(migrations, reference, phase);
      const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
      const names = new Set(tables.map(row => row.tablename));
      if (establishedTables.some(name => !names.has(name))) throw new Error('NEON_PROBE_SCHEMA');
      const { rows: [status] } = await client.query(`SELECT EXISTS(
        SELECT 1 FROM pg_trigger WHERE tgrelid='public.mtx_daily_claims'::regclass
        AND tgname='mtx_archive_daily_reward' AND tgenabled='O' AND NOT tgisinternal) AS trigger`);
      if (status?.trigger !== true) throw new Error('NEON_PROBE_SCHEMA');
      if (idleError) throw new Error('NEON_PROBE_CONNECTION');
      await client.query('ROLLBACK');
      return { tls: true, readonly: true, tables: tables.length, migrations: migrations.length,
        pendingMigrations: reference.length - migrations.length, rewardTrigger: true };
    }
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
