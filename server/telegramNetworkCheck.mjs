import https from 'node:https';
import console from 'node:console';
import { resolve } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const timeoutMs = 12_000;

// Never print exception messages: network libraries can include request URLs.
export function errorCodes(error, depth = 0) {
  if (!error || depth > 3) return [];
  const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,60}$/.test(error.code)
    ? [error.code] : [];
  return [...new Set([
    ...code,
    ...errorCodes(error.cause, depth + 1),
    ...(Array.isArray(error.errors) ? error.errors.slice(0, 8).flatMap((item) => errorCodes(item, depth + 1)) : []),
  ])];
}

export async function probeFetch(url, fetchImplementation = globalThis.fetch, deadlineMs = timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetchImplementation(url, {
      method: 'HEAD', redirect: 'manual', signal: globalThis.AbortSignal.timeout(deadlineMs),
    });
    await response.body?.cancel();
    // Even a 4xx response proves HTTP connectivity, not token validity.
    return { reachable: true, status: response.status, elapsedMs: Date.now() - started };
  } catch (error) {
    return { reachable: false, codes: errorCodes(error), timeout: error?.name === 'TimeoutError', elapsedMs: Date.now() - started };
  }
}

export function probeHttps(url, family, requestImplementation = https.request, deadlineMs = timeoutMs) {
  return new Promise((resolveResult) => {
    const started = Date.now();
    let stage = 'dns';
    let finished = false;
    let request;
    let timer;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolveResult({ ...result, stage, elapsedMs: Date.now() - started });
    };
    try {
      request = requestImplementation(url, { method: 'HEAD', family, agent: false }, (response) => {
        stage = 'http';
        finish({ reachable: true, status: response.statusCode });
        response.destroy();
      });
      request.on('socket', (socket) => {
        socket.once('lookup', (error) => { if (!error) stage = 'tcp'; });
        socket.once('connect', () => { stage = 'tls'; });
        socket.once('secureConnect', () => { stage = 'awaiting_http'; });
      });
      request.once('error', (error) => finish({ reachable: false, codes: errorCodes(error) }));
      timer = setTimeout(() => {
        finish({ reachable: false, codes: ['DEADLINE_EXCEEDED'] });
        request.destroy();
      }, deadlineMs);
      request.end();
    } catch (error) {
      finish({ reachable: false, codes: errorCodes(error) });
      request?.destroy();
    }
  });
}

export async function runNetworkCheck(log = console.log) {
  log(`MTX_NETWORK_CHECK_BEGIN ${new Date().toISOString()}`);
  // Public endpoints only: no token, environment variables, database, or Redis access.
  const probes = [
    ['control_render_fetch', () => probeFetch('https://render.com/')],
    ['telegram_fetch_default', () => probeFetch('https://api.telegram.org/')],
    ['telegram_https_ipv4', () => probeHttps('https://api.telegram.org/', 4)],
    ['telegram_https_ipv6', () => probeHttps('https://api.telegram.org/', 6)],
  ];
  await Promise.all(probes.map(async ([name, probe]) => {
    const result = await probe();
    log(`MTX_NETWORK_CHECK ${JSON.stringify({ name, ...result })}`);
  }));
  log('MTX_NETWORK_CHECK_END connectivity_only_not_bot_identity');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A diagnostic must not keep the application from starting if DNS gets stuck.
  const watchdog = setTimeout(() => {
    process.stdout.write('MTX_NETWORK_CHECK_WATCHDOG continuing_without_complete_results\n', () => process.exit(0));
  }, 20_000);
  watchdog.unref();
  try { await runNetworkCheck(); }
  catch (error) { console.log(`MTX_NETWORK_CHECK_INTERNAL ${JSON.stringify({ codes: errorCodes(error) })}`); }
}
