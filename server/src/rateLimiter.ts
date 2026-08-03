interface Bucket { count: number; resetAt: number; }

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maximum: number;
  private readonly windowMs: number;
  constructor(maximum: number, windowMs: number) { this.maximum = maximum; this.windowMs = windowMs; }
  consume(key: string, now = Date.now()): boolean {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) { this.buckets.set(key, { count: 1, resetAt: now + this.windowMs }); return true; }
    if (existing.count >= this.maximum) return false;
    existing.count += 1;
    return true;
  }
}
