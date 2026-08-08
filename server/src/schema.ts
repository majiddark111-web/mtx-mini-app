import type { AuthenticatedUser } from './types.ts';

export class ValidationError extends Error {}

export interface Schema<T> { parse(value: unknown): T; }

export const authRequestSchema: Schema<{ initData: string }> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Body must be an object');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'initData')) throw new ValidationError('Unknown body field');
    if (typeof body.initData !== 'string' || body.initData.length < 10 || body.initData.length > 8_192) throw new ValidationError('Invalid initData');
    return { initData: body.initData };
  },
};

export const emptyQuerySchema: Schema<Record<string, never>> = {
  parse(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length > 0) throw new ValidationError('Query parameters are not allowed');
    return {};
  },
};

export const tapBatchSchema: Schema<{ taps: number; durationMs: number; batchId: string }> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Body must be an object');
    const body = value as Record<string, unknown>;
    const allowed = new Set(['taps', 'durationMs', 'batchId']);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new ValidationError('Unknown body field');
    if (!Number.isSafeInteger(body.taps) || (body.taps as number) < 1 || (body.taps as number) > 50) throw new ValidationError('Invalid tap count');
    if (!Number.isSafeInteger(body.durationMs) || (body.durationMs as number) < 100 || (body.durationMs as number) > 10_000) throw new ValidationError('Invalid duration');
    if (typeof body.batchId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.batchId)) throw new ValidationError('Invalid batch id');
    return { taps: body.taps as number, durationMs: body.durationMs as number, batchId: body.batchId };
  },
};

export const purchaseSchema: Schema<{ itemId: string; idempotencyKey: string }> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Body must be an object');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'itemId' && key !== 'idempotencyKey')) throw new ValidationError('Unknown body field');
    if (typeof body.itemId !== 'string' || !/^(upgrade:(tap|energy|profit)|skin:aurora|boost:recharge|consumable:energy)$/.test(body.itemId)) throw new ValidationError('Invalid item');
    if (typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.idempotencyKey)) throw new ValidationError('Invalid idempotency key');
    return { itemId: body.itemId, idempotencyKey: body.idempotencyKey };
  },
};

export const paymentConfirmationSchema: Schema<{ provider: 'ton' | 'usdt'; transactionId: string; amount: number; asset: 'TON' | 'USDT' }> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Body must be an object');
    const body = value as Record<string, unknown>;
    const allowed = new Set(['provider', 'transactionId', 'amount', 'asset']);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new ValidationError('Unknown body field');
    if (body.provider !== 'ton' && body.provider !== 'usdt') throw new ValidationError('Invalid provider');
    if (typeof body.transactionId !== 'string' || !/^[a-zA-Z0-9:_-]{12,128}$/.test(body.transactionId)) throw new ValidationError('Invalid transaction');
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1_000_000) throw new ValidationError('Invalid amount');
    if (body.asset !== 'TON' && body.asset !== 'USDT') throw new ValidationError('Invalid asset');
    return { provider: body.provider, transactionId: body.transactionId, amount: body.amount, asset: body.asset };
  },
};

export const missionClaimSchema: Schema<{ missionId: string }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'missionId') || typeof body.missionId !== 'string' || !/^(daily-taps|weekly-coins|monthly-level)$/.test(body.missionId)) throw new ValidationError('Invalid mission'); return { missionId: body.missionId }; } };
export const referralAcceptSchema: Schema<{ code: string; deviceHash: string }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'code' && key !== 'deviceHash') || typeof body.code !== 'string' || !/^LUMOS-[a-zA-Z0-9_-]{1,64}$/.test(body.code) || typeof body.deviceHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.deviceHash)) throw new ValidationError('Invalid referral'); return { code: body.code, deviceHash: body.deviceHash }; } };
export const challengeClaimSchema: Schema<{ type: 'combo' | 'cipher'; answer: string[] }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'type' && key !== 'answer') || (body.type !== 'combo' && body.type !== 'cipher') || !Array.isArray(body.answer) || body.answer.length < 1 || body.answer.length > 3 || body.answer.some((item) => typeof item !== 'string' || item.length > 64)) throw new ValidationError('Invalid challenge'); return { type: body.type, answer: body.answer as string[] }; } };
export const adminLoginSchema: Schema<{ username: string; password: string; otp: string }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['username', 'password', 'otp'].includes(key)) || typeof body.username !== 'string' || body.username.length < 3 || body.username.length > 64 || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256 || typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)) throw new ValidationError('Invalid admin login'); return { username: body.username, password: body.password, otp: body.otp }; } };
export const adminBanSchema: Schema<{ userId: string; banned: boolean }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'userId' && key !== 'banned') || typeof body.userId !== 'string' || body.userId.length > 64 || typeof body.banned !== 'boolean') throw new ValidationError('Invalid ban request'); return { userId: body.userId, banned: body.banned }; } };
export const adminNotificationSchema: Schema<{ title: string; message: string }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'title' && key !== 'message') || typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 100 || typeof body.message !== 'string' || body.message.length < 1 || body.message.length > 1_000) throw new ValidationError('Invalid notification'); return { title: body.title, message: body.message }; } };
export const adminEventSchema: Schema<{ title: string; startsAt: number; endsAt: number; multiplier: number }> = { parse(value) { const body = value as Record<string, unknown>; if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['title', 'startsAt', 'endsAt', 'multiplier'].includes(key)) || typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 100 || typeof body.startsAt !== 'number' || typeof body.endsAt !== 'number' || body.endsAt <= body.startsAt || typeof body.multiplier !== 'number' || body.multiplier < 1 || body.multiplier > 5) throw new ValidationError('Invalid event'); return { title: body.title, startsAt: body.startsAt, endsAt: body.endsAt, multiplier: body.multiplier }; } };

export const telegramUserSchema: Schema<AuthenticatedUser> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Telegram user is missing');
    const user = value as Record<string, unknown>;
    if ((!Number.isSafeInteger(user.id) && typeof user.id !== 'string') || typeof user.first_name !== 'string' || user.first_name.length === 0) throw new ValidationError('Telegram user is invalid');
    const optional = (field: string): string | undefined => user[field] === undefined ? undefined : typeof user[field] === 'string' ? user[field] : (() => { throw new ValidationError(`Invalid ${field}`); })();
    return { id: String(user.id), firstName: user.first_name, lastName: optional('last_name'), username: optional('username'), photoUrl: optional('photo_url') };
  },
};
