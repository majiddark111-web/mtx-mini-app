type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Server contract: Retry-After is whole seconds (IP, player or tap budget).
// Session storage preserves the wait across a reload without changing the outbox.
export class TapRetryWindow {
  private deadlines = new Map<string, number>();
  private readonly store: () => Store | undefined;
  private readonly now: () => number;
  constructor(store: () => Store | undefined, now = Date.now) { this.store = store; this.now = now; }
  remaining(user: string): number {
    const key = 'mtx.tap-retry.v1:' + user;
    const now = this.now();
    let until = this.deadlines.get(user) ?? 0;
    try {
      const storage = this.store();
      const raw = storage?.getItem(key);
      if (raw != null) {
        const saved = Number(raw);
        if (Number.isSafeInteger(saved) && saved > now && saved <= now + 86_400_000) until = Math.max(until, saved);
        else storage?.removeItem(key);
      }
    } catch { /* Storage may be unavailable; the in-memory deadline still applies. */ }
    if (until <= now) { this.deadlines.delete(user); return 0; }
    return until - now;
  }
  defer(user: string, header: unknown): void {
    const seconds = Number(header);
    const delay = Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86400 ? seconds * 1000 : 2000;
    const until = this.now() + Math.max(this.remaining(user), delay);
    this.deadlines.set(user, until);
    try { this.store()?.setItem('mtx.tap-retry.v1:' + user, String(until)); } catch { /* Memory fallback. */ }
  }
}
