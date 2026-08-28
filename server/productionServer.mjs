import process from 'node:process';
import worker from './src/worker.ts';
import { validateEnv } from './src/app.ts';
import { createNodeInfrastructure } from './nodeInfrastructure.mjs';
import { closeHttpServer, startFetchServer } from './nodeHttp.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const infrastructure = await createNodeInfrastructure(process.env);
const appOriginValue = required('APP_ORIGIN');
let appOrigin;
try { appOrigin = new URL(appOriginValue).origin; }
catch { throw new Error('APP_ORIGIN must be a valid absolute URL'); }
const environment = {
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  JWT_SECRET: required('JWT_SECRET'),
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
  APP_ORIGIN: appOrigin,
  AUTH_MAX_AGE_SECONDS: process.env.AUTH_MAX_AGE_SECONDS?.trim() ?? '300',
  AUTH_LOG: (message) => process.stderr.write(`Telegram authentication rejected: ${message}\n`),
  POSTGRES: infrastructure.postgres,
  REDIS: infrastructure.redis,
};
validateEnv(environment);
const port = Number(process.env.PORT ?? '3000');
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PORT is invalid');

const server = startFetchServer({
  host: process.env.HOST ?? '0.0.0.0',
  port,
  label: 'MTX production API',
  fetchHandler: async (request) => {
    if (new URL(request.url).pathname === '/healthz') {
      try { await infrastructure.health(); return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'content-type': 'application/json; charset=utf-8' } }); }
      catch { return new Response(JSON.stringify({ status: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }); }
    }
    return worker.fetch(request, environment);
  },
});

const flushInterval = setInterval(() => worker.scheduled(undefined, environment).catch((error) => process.stderr.write(`Persistence flush failed: ${error.message}\n`)), 5_000);
flushInterval.unref();
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(flushInterval);
  await closeHttpServer(server);
  await worker.scheduled(undefined, environment);
  await infrastructure.close();
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown().then(() => process.exit(0)).catch((error) => { process.stderr.write(`Shutdown failed: ${error.message}\n`); process.exit(1); }));
