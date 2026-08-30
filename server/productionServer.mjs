import process from 'node:process';
import worker from './src/worker.ts';
import { validateEnv } from './src/app.ts';
import { createNodeInfrastructure } from './nodeInfrastructure.mjs';
import { closeHttpServer, startFetchServer } from './nodeHttp.mjs';
import { verifyTelegramBotIdentity } from './botIdentity.mjs';
import { createTonPaymentVerifier } from './tonPaymentVerifier.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const infrastructure = await createNodeInfrastructure(process.env);
const telegramBotToken = required('TELEGRAM_BOT_TOKEN');
const telegramBotUsername = required('TELEGRAM_BOT_USERNAME');
try {
  const telegramBot = await verifyTelegramBotIdentity(telegramBotToken, telegramBotUsername);
  process.stdout.write(`Telegram bot identity verified: @${telegramBot.username} (id ${telegramBot.id})\n`);
} catch (error) {
  process.stderr.write(`Telegram bot identity diagnostic failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
}
const appOriginValue = required('APP_ORIGIN');
let appOrigin;
try { appOrigin = new URL(appOriginValue).origin; }
catch { throw new Error('APP_ORIGIN must be a valid absolute URL'); }
const environment = {
  TELEGRAM_BOT_TOKEN: telegramBotToken,
  JWT_SECRET: required('JWT_SECRET'),
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
  APP_ORIGIN: appOrigin,
  AUTH_MAX_AGE_SECONDS: process.env.AUTH_MAX_AGE_SECONDS?.trim() ?? '300',
  AUTH_LOG: (message) => process.stderr.write(`Telegram authentication rejected: ${message}\n`),
  POSTGRES: infrastructure.postgres,
  REDIS: infrastructure.redis,
  TON_TREASURY_ADDRESS: required('TON_TREASURY_ADDRESS'),
  TON_PAYMENT_AMOUNT_NANO: Number(process.env.TON_PAYMENT_AMOUNT_NANO ?? '10000000'),
  TON_PAYMENT_CREDIT_MTX: Number(process.env.TON_PAYMENT_CREDIT_MTX ?? '100'),
  PAYMENT_VERIFIER: createTonPaymentVerifier({
    apiKey: required('TONCENTER_API_KEY'),
    baseUrl: process.env.TONCENTER_BASE_URL?.trim() || 'https://testnet.toncenter.com',
    treasuryAddress: required('TON_TREASURY_ADDRESS'),
    amountNano: Number(process.env.TON_PAYMENT_AMOUNT_NANO ?? '10000000'),
    creditedCoins: Number(process.env.TON_PAYMENT_CREDIT_MTX ?? '100'),
  }),
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
