const normalizedUsername = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase();

export async function verifyTelegramBotIdentity(botToken, expectedUsername, fetchImplementation = globalThis.fetch) {
  const expected = normalizedUsername(expectedUsername);
  if (!expected) throw new Error('TELEGRAM_BOT_USERNAME is required');

  let response;
  try {
    response = await fetchImplementation(`https://api.telegram.org/bot${botToken}/getMe`, {
      headers: { accept: 'application/json' },
      signal: globalThis.AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
      ? String(error.cause.code)
      : error instanceof Error ? error.name : 'unknown';
    throw new Error(`Telegram Bot API could not be reached while verifying the bot token (${reason})`);
  }

  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('Telegram Bot API returned an invalid response'); }
  if (!response.ok || payload?.ok !== true || !payload?.result?.username) {
    throw new Error('TELEGRAM_BOT_TOKEN was rejected by Telegram');
  }

  const actual = normalizedUsername(payload.result.username);
  if (actual !== expected) {
    throw new Error(`TELEGRAM_BOT_TOKEN belongs to @${payload.result.username}, not @${expectedUsername.replace(/^@/, '')}`);
  }
  return { id: String(payload.result.id), username: payload.result.username };
}
