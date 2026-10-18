export interface SessionCredentials { token: string; sessionKey: string; }
export interface PlayerSession extends SessionCredentials { expiresAt: number; renewUntil: number; userId: string; }
export class SessionExpiredError extends Error {
  constructor() { super('Session expired. Close and reopen the Mini App.'); }
}
export class SessionRejectedError extends SessionExpiredError {}

const RENEW_BEFORE_MS = 60_000;
const RETRY_AFTER_MS = 15_000;

// These claims only schedule client work. The server verifies the signature.
function readSession(credentials: SessionCredentials): PlayerSession {
  const encoded = credentials.token.split('.')[1];
  const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4))) as { sub?: unknown; exp?: unknown; iat?: unknown; sessionStartedAt?: unknown };
  const startedAt = payload.sessionStartedAt ?? payload.iat;
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || typeof startedAt !== 'number' || !Number.isSafeInteger(startedAt) || !credentials.sessionKey) throw new Error('Invalid session response');
  return { ...credentials, userId: payload.sub, expiresAt: payload.exp * 1_000, renewUntil: (startedAt + 8 * 60 * 60) * 1_000 };
}

export class PlayerSessionController {
  private session: PlayerSession | undefined;
  private renewal: Promise<PlayerSession> | undefined;
  private retryAt = 0;
  private readonly refresh: (session: PlayerSession) => Promise<SessionCredentials>;
  private readonly onExpired: () => void;
  private readonly now: () => number;

  constructor(refresh: (session: PlayerSession) => Promise<SessionCredentials>, onExpired: () => void, now = Date.now) {
    this.refresh = refresh; this.onExpired = onExpired; this.now = now;
  }

  install(credentials: SessionCredentials): void {
    const session = readSession(credentials);
    if (session.expiresAt <= this.now() || session.renewUntil <= this.now()) throw new SessionExpiredError();
    this.session = session;
    this.renewal = undefined;
    this.retryAt = 0;
  }

  current(): PlayerSession | undefined { return this.session; }

  reject(token: string): void {
    // A late response from an old request must not erase newer credentials.
    if (this.session?.token !== token) return;
    this.session = undefined;
    this.renewal = undefined;
    this.onExpired();
  }

  usable(): boolean {
    const session = this.session;
    if (!session) return false;
    if (session.expiresAt <= this.now() || session.renewUntil <= this.now()) { this.reject(session.token); return false; }
    return true;
  }

  async ensure(): Promise<PlayerSession> {
    if (!this.usable()) throw new SessionExpiredError();
    const current = this.session!;
    if (this.renewal) return this.renewal;
    // Do not repeatedly renew the final token, whose expiry is the absolute limit.
    if (current.expiresAt - this.now() > RENEW_BEFORE_MS || this.now() < this.retryAt || current.expiresAt >= current.renewUntil) return current;
    const renewal = this.renew(current);
    this.renewal = renewal;
    try { return await renewal; }
    finally { if (this.renewal === renewal) this.renewal = undefined; }
  }

  private async renew(previous: PlayerSession): Promise<PlayerSession> {
    try {
      const next = readSession(await this.refresh(previous));
      if (this.session !== previous) {
        if (!this.usable() || this.session?.userId !== previous.userId) throw new SessionExpiredError();
        return this.session!;
      }
      if (next.userId !== previous.userId || next.renewUntil !== previous.renewUntil || next.expiresAt <= this.now() || next.expiresAt > next.renewUntil) throw new SessionRejectedError();
      this.session = next;
      this.retryAt = this.now() + RETRY_AFTER_MS;
      return next;
    } catch (error) {
      if (this.session !== previous) {
        if (!this.usable() || this.session?.userId !== previous.userId) throw new SessionExpiredError();
        return this.session!;
      }
      if (error instanceof SessionExpiredError) { this.reject(previous.token); throw error; }
      if (!this.usable()) throw new SessionExpiredError();
      // A timeout/429/5xx does not log out a still-valid session or replay a mutation.
      this.retryAt = this.now() + RETRY_AFTER_MS;
      return previous;
    }
  }
}
