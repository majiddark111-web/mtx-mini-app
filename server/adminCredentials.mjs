import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const same = (left, right) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
const decodeBase32 = (value) => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = ''; for (const character of clean) { const index = alphabet.indexOf(character); if (index < 0) throw new Error('ADMIN_TOTP_SECRET must be valid Base32'); bits += index.toString(2).padStart(5, '0'); } const bytes = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2)); if (bytes.length < 16) throw new Error('ADMIN_TOTP_SECRET must contain at least 128 bits'); return Buffer.from(bytes); };

export function hashAdminPassword(password, salt = randomBytes(16)) { if (typeof password !== 'string' || password.length < 12) throw new Error('Admin password must contain at least 12 characters'); const derived = scryptSync(password, salt, 64); return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`; }
function verifyPassword(password, encoded) { const [algorithm, saltHex, expectedHex, extra] = encoded.split(':'); if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(saltHex ?? '') || !/^[a-f0-9]{128}$/i.test(expectedHex ?? '') || extra) return false; const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64); return same(actual, Buffer.from(expectedHex, 'hex')); }
export function totpAt(secret, now = Date.now()) { const key = decodeBase32(secret); const counter = Math.floor(now / 30_000); const value = Buffer.alloc(8); value.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', key).update(value).digest(); const offset = digest[digest.length - 1] & 15; const code = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]; return String(code % 1_000_000).padStart(6, '0'); }

export function createAdminAuth({ username, passwordHash, totpSecret, now = () => Date.now() }) {
  if (!username || username.length < 3) throw new Error('ADMIN_USERNAME is invalid');
  decodeBase32(totpSecret);
  if (!passwordHash?.startsWith('scrypt:')) throw new Error('ADMIN_PASSWORD_HASH is invalid');
  return { async verify(input) { const moment = now(); const otpValid = [-30_000, 0, 30_000].some((offset) => same(input.otp, totpAt(totpSecret, moment + offset))); const usernameValid = same(input.username, username); const passwordValid = verifyPassword(input.password, passwordHash); return usernameValid && passwordValid && otpValid ? { id: username } : null; } };
}
