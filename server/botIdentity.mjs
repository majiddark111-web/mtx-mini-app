import { setTimeout as sleep } from 'node:timers/promises';

const normalizedUsername = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase();
const maximumAttempts = 3;
const transientCodes = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);

class RetryableIdentityError extends Error {
  constructor(message, reason) {
    super(message);
    this.reason = reason;
  }
}

function networkReasons(error, depth = 0) {
  if (!error || depth > 4) return [];
  return [
    ...(typeof error.code === 'string' ? [error.code] : []),
    ...(['TimeoutError', 'AbortError'].includes(error.name) ? ['REQUEST_TIMEOUT'] : []),
    ...networkReasons(error.cause, depth + 1),
    ...(Array.isArray(error.errors) ? error.errors.slice(0, 8).flatMap((item) => networkReasons(item, depth + 1)) : []),
  ];
}

function requestFailure(error, invalidBody = false) {
  const reasons = [...new Set(networkReasons(error))];
  // Only known transient failures are retried. Never log raw errors or request URLs.
  const retryable = reasons.length > 0 && reasons.every((reason) => reason === 'REQUEST_TIMEOUT' || transientCodes.has(reason));
  if (retryable) {
    const reason = reasons.join(',');
    return new RetryableIdentityError(`Telegram Bot API could not be reached while verifying the bot token (${reason})`, reason);
  }
  return new Error(invalidBody
    ? 'Telegram Bot API returned an invalid response'
    : 'Telegram Bot API could not be reached while verifying the bot token (NON_RETRYABLE_NETWORK_ERROR)');
}

async function verifyAttempt(botToken, expectedUsername, fetchImplementation) {
  const expected = normalizedUsername(expectedUsername);
  let response;
  try {
    response = await fetchImplementation(`https://api.telegram.org/bot${botToken}/getMe`, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw requestFailure(error);
  }

  if (!response.ok) {
    // Release the body before another attempt; do not log Telegram response content.
    try { await response.body?.cancel(); } catch { /* An already-failed stream needs no cleanup. */ }
    if ([502, 503, 504].includes(response.status)) {
      throw new RetryableIdentityError(`Telegram Bot API temporarily unavailable (HTTP ${response.status})`, `HTTP_${response.status}`);
    }
    if ([401, 403].includes(response.status)) throw new Error('TELEGRAM_BOT_TOKEN was rejected by Telegram');
    throw new Error(`Telegram Bot API returned HTTP ${response.status}`);
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) { throw requestFailure(error, true); }
  if (payload?.ok !== true || typeof payload?.result?.username !== 'string') {
    throw new Error('TELEGRAM_BOT_TOKEN was rejected by Telegram');
  }

  const actual = normalizedUsername(payload.result.username);
  if (actual !== expected) {
    throw new Error(`TELEGRAM_BOT_TOKEN belongs to @${payload.result.username}, not @${String(expectedUsername).trim().replace(/^@/, '')}`);
  }
  return { id: String(payload.result.id), username: payload.result.username };
}

export async function verifyTelegramBotIdentity(botToken, expectedUsername, fetchImplementation = globalThis.fetch, options = {}) {
  const expected = normalizedUsername(expectedUsername);
  if (!expected) throw new Error('TELEGRAM_BOT_USERNAME is required');
  const pause = options.sleep ?? sleep;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try { return await verifyAttempt(botToken, expectedUsername, fetchImplementation); }
    catch (error) {
      if (!(error instanceof RetryableIdentityError)) throw error;
      if (attempt === maximumAttempts) throw new Error(`${error.message}; failed after ${maximumAttempts} attempts`);
      const delayMs = 1_000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      options.onRetry?.({ nextAttempt: attempt + 1, maximumAttempts, delayMs, reason: error.reason });
      await pause(delayMs);
    }
  }
}
