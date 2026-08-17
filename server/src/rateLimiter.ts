interface Bucket { count: number; resetAt: number; }
export interface RequestRateLimiter { consume(key: string, now?: number): boolean | Promise<boolean>; }

export class RateLimiter implements RequestRateLimiter {
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

export interface RateLimitRedis { command<T>(parts: string[]): Promise<T>; }
export class RedisRateLimiter implements RequestRateLimiter {
  private readonly script = "local current = redis.call('INCR', KEYS[1]); if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return current";
  constructor(privateRedis: RateLimitRedis, privateMaximum: number, privateWindowMs: number, privatePrefix: string) { this.redis = privateRedis; this.maximum = privateMaximum; this.windowMs = privateWindowMs; this.prefix = privatePrefix; }
  private readonly redis: RateLimitRedis;
  private readonly maximum: number;
  private readonly windowMs: number;
  private readonly prefix: string;
  async consume(key: string): Promise<boolean> { const count = Number(await this.redis.command<number>(['EVAL', this.script, '1', `${this.prefix}:${key}`, String(this.windowMs)])); return count <= this.maximum; }
}
