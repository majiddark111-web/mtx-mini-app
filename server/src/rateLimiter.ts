interface Bucket { count: number; resetAt: number; }
export interface RequestRateLimiter {
  consume(key: string, now?: number): boolean | Promise<boolean>;
  // One attempt: zero if allowed, otherwise remaining milliseconds.
  consumeWithDelay?(key: string, now?: number): number | Promise<number>;
}

export class RateLimiter implements RequestRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maximum: number;
  private readonly windowMs: number;
  constructor(maximum: number, windowMs: number) { this.maximum = maximum; this.windowMs = windowMs; }
  consume(key: string, now = Date.now()): boolean {
    return this.consumeWithDelay(key, now) === 0;
  }
  consumeWithDelay(key: string, now = Date.now()): number {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) { this.buckets.set(key, { count: 1, resetAt: now + this.windowMs }); return 0; }
    if (existing.count >= this.maximum) return existing.resetAt - now;
    existing.count += 1;
    return 0;
  }
}

export interface RateLimitRedis { command<T>(parts: string[]): Promise<T>; }
export class RedisRateLimiter implements RequestRateLimiter {
  private readonly script = "local n = redis.call('INCR', KEYS[1]); local ttl = redis.call('PTTL', KEYS[1]); if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]); end; if n <= tonumber(ARGV[2]) then return 0; end; return math.max(1, ttl)";
  constructor(privateRedis: RateLimitRedis, privateMaximum: number, privateWindowMs: number, privatePrefix: string) { this.redis = privateRedis; this.maximum = privateMaximum; this.windowMs = privateWindowMs; this.prefix = privatePrefix; }
  private readonly redis: RateLimitRedis;
  private readonly maximum: number;
  private readonly windowMs: number;
  private readonly prefix: string;
  async consume(key: string): Promise<boolean> { return (await this.consumeWithDelay(key)) === 0; }
  async consumeWithDelay(key: string): Promise<number> {
    const delay = await this.redis.command<number>(['EVAL', this.script, '1', `${this.prefix}:${key}`, String(this.windowMs), String(this.maximum)]);
    if (!Number.isSafeInteger(delay) || delay < 0) throw new Error('Invalid rate limiter response');
    return delay;
  }
}
