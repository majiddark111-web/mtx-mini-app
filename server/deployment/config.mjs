import { URL } from 'node:url';

export function appOrigin(domain) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
    throw new Error('MTX_DOMAIN must be a hostname without scheme, port or path');
  }
  if (/(^|\.)(example\.(com|net|org)|localhost)$/i.test(domain)) throw new Error('MTX_DOMAIN is still a placeholder');
  return `https://${domain.toLowerCase()}`;
}

const allowed = new Set(['TELEGRAM_BOT_TOKEN', 'JWT_SECRET', 'ADMIN_JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET', 'DATABASE_URL', 'REDIS_URL', 'TONCENTER_API_KEY', 'TONCENTER_BASE_URL', 'TON_TREASURY_ADDRESS', 'TON_PAYMENT_AMOUNT_NANO', 'TON_PAYMENT_CREDIT_MTX', 'AUTH_MAX_AGE_SECONDS']);

export function portableEnvironment(input, domain, botUsername) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('API configuration must be a JSON object');
  const env = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) throw new Error(`Unsupported configuration key: ${key}`);
    if (typeof value !== 'string' || !value.trim() || /REPLACE_WITH|example\.(com|net|org)/i.test(value)) throw new Error(`Configure ${key}`);
    env[key] = value.trim();
  }
  for (const name of ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET', 'ADMIN_JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET', 'DATABASE_URL', 'REDIS_URL', 'TONCENTER_API_KEY', 'TON_TREASURY_ADDRESS']) {
    if (!env[name]) throw new Error(`Configure ${name}`);
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN)) throw new Error('TELEGRAM_BOT_TOKEN must be a BotFather token, not a username');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername ?? '')) throw new Error('MTX_BOT_USERNAME is invalid');
  if (env.JWT_SECRET.length < 32 || env.ADMIN_JWT_SECRET.length < 32 || env.JWT_SECRET === env.ADMIN_JWT_SECRET) throw new Error('Use separate JWT secrets of at least 32 characters');
  if (env.ADMIN_USERNAME.length < 3 || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(env.ADMIN_PASSWORD_HASH)) throw new Error('Admin username or password hash is invalid');
  if (!/^[A-Z2-7]{26,}$/i.test(env.ADMIN_TOTP_SECRET)) throw new Error('Admin TOTP secret must contain at least 128 bits of Base32');
  for (const [name, protocols] of [['DATABASE_URL', ['postgres:', 'postgresql:']], ['REDIS_URL', ['rediss:']]]) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} is not a valid connection URL`); }
    if (!protocols.includes(url.protocol) || !url.hostname || !url.password || url.search || url.hash) throw new Error(`${name} must have credentials and no query/hash; TLS is enforced separately`);
  }
  if (env.TONCENTER_BASE_URL && env.TONCENTER_BASE_URL !== 'https://testnet.toncenter.com') throw new Error('This portable release supports TON Testnet only');
  for (const [name, fallback] of [['TON_PAYMENT_AMOUNT_NANO', '10000000'], ['TON_PAYMENT_CREDIT_MTX', '100'], ['AUTH_MAX_AGE_SECONDS', '300']]) {
    env[name] ??= fallback;
    if (!Number.isSafeInteger(Number(env[name])) || Number(env[name]) < 1) throw new Error(`${name} must be a positive integer`);
  }
  return { ...env, TONCENTER_BASE_URL: 'https://testnet.toncenter.com', TELEGRAM_BOT_USERNAME: botUsername, APP_ORIGIN: appOrigin(domain), NODE_ENV: 'production', POSTGRES_SSL: 'true', POSTGRES_TLS_REJECT_UNAUTHORIZED: 'true', HOST: '0.0.0.0', PORT: '3000' };
}

export function walletManifest(domain) {
  const origin = appOrigin(domain);
  return { url: origin, name: 'MTX', iconUrl: `${origin}/mtx.png` };
}
