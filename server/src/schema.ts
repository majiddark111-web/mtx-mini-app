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

export const telegramUserSchema: Schema<AuthenticatedUser> = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new ValidationError('Telegram user is missing');
    const user = value as Record<string, unknown>;
    if ((!Number.isSafeInteger(user.id) && typeof user.id !== 'string') || typeof user.first_name !== 'string' || user.first_name.length === 0) throw new ValidationError('Telegram user is invalid');
    const optional = (field: string): string | undefined => user[field] === undefined ? undefined : typeof user[field] === 'string' ? user[field] : (() => { throw new ValidationError(`Invalid ${field}`); })();
    return { id: String(user.id), firstName: user.first_name, lastName: optional('last_name'), username: optional('username'), photoUrl: optional('photo_url') };
  },
};
