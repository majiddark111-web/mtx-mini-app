import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivePassword = promisify(scrypt);
const passwordPattern = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i;

const same = (left, right) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
const decodeBase32 = (value) => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const normalized = typeof value === 'string' ? value.toUpperCase().replace(/\s/g, '') : ''; if (!/^[A-Z2-7]+=*$/.test(normalized)) throw new Error('ADMIN_TOTP_SECRET must be valid Base32'); const clean = normalized.replace(/=+$/, ''); let bits = ''; for (const character of clean) { const index = alphabet.indexOf(character); bits += index.toString(2).padStart(5, '0'); } const bytes = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2)); if (bytes.length < 16) throw new Error('ADMIN_TOTP_SECRET must contain at least 128 bits'); return Buffer.from(bytes); };

export function hashAdminPassword(password, salt = randomBytes(16)) { if (typeof password !== 'string' || password.length < 12) throw new Error('Admin password must contain at least 12 characters'); const derived = scryptSync(password, salt, 64); return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`; }
async function verifyPassword(password, encoded) { const [, saltHex, expectedHex] = encoded.split(':'); const actual = await derivePassword(password, Buffer.from(saltHex, 'hex'), 64); return same(actual, Buffer.from(expectedHex, 'hex')); }
export function totpAt(secret, now = Date.now()) { const key = decodeBase32(secret); const counter = Math.floor(now / 30_000); const value = Buffer.alloc(8); value.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', key).update(value).digest(); const offset = digest[digest.length - 1] & 15; const code = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]; return String(code % 1_000_000).padStart(6, '0'); }

// Both operations are atomic across API instances. The last accepted counter has
// no expiry so a server restart or clock rollback cannot make it reusable.
const consumeCounterScript = `
local previous = redis.call('GET', KEYS[1])
if previous and tonumber(previous) >= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
return 1`;
const attemptScript = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return attempts`;

export function createAdminAuth({ username, passwordHash, totpSecret, redis, now = () => Date.now() }) {
  if (!username || username.length < 3) throw new Error('ADMIN_USERNAME is invalid');
  const secretBytes = decodeBase32(totpSecret);
  if (!passwordPattern.test(passwordHash ?? '')) throw new Error('ADMIN_PASSWORD_HASH is invalid');
  if (typeof redis?.command !== 'function') throw new Error('Admin authentication requires shared Redis');
  const accountKey = createHash('sha256').update(username).digest('hex');
  const credentialKey = createHash('sha256').update(username).update('\0').update(secretBytes).digest('hex');
  return {
    async verify(input) {
      if (typeof input?.username !== 'string' || typeof input.password !== 'string' || !/^\d{6}$/.test(input.otp ?? '') || input.password.length > 1024) return null;
      if (!same(input.username, username)) return null;
      const attempts = await redis.command(['EVAL', attemptScript, '1', `mtx:admin:attempts:${accountKey}`]);
      if (Number(attempts) > 5) return null;
      if (!await verifyPassword(input.password, passwordHash)) return null;
      const moment = now();
      // Check newest first if two adjacent counters happen to share six digits.
      const offset = [30_000, 0, -30_000].find((delta) => same(input.otp, totpAt(totpSecret, moment + delta)));
      if (offset === undefined) return null;
      const counter = Math.floor((moment + offset) / 30_000);
      const accepted = await redis.command(['EVAL', consumeCounterScript, '1', `mtx:admin:totp:${credentialKey}`, String(counter)]);
      return Number(accepted) === 1 ? { id: username } : null;
    },
  };
}
