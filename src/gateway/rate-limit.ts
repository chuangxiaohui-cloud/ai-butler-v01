/**
 * gateway 限速与并发闸门（P16）
 * RateLimiter：按 IP 令牌桶限速，过期桶定期清扫 + 超 [P-114] 上限强制淘汰最旧，
 * 避免 rateBuckets Map 每个新 IP 永久占一条。
 * ConcurrencyGate：/api/ask 并发上限 [P-115]，防 30 req/min 内并发请求同时打满 LLM 配额。
 */

import { PARAMS } from '../config/params.js';

const WINDOW_MS = 60_000;
const SWEEP_INTERVAL_MS = 60_000;

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private nextSweepAt = 0;

  constructor(
    private readonly maxPerMin: number,
    private readonly maxEntries: number = PARAMS.rateLimitMaxEntries, // [P-114]
  ) {}

  /** 放行返回 true；超限返回 false。过期桶重置为新窗口。 */
  allow(ip: string, now = Date.now()): boolean {
    this.sweep(now);
    const bucket = this.buckets.get(ip);
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      this.enforceMax();
      return true;
    }
    if (bucket.count >= this.maxPerMin) return false;
    bucket.count++;
    return true;
  }

  size(): number {
    return this.buckets.size;
  }

  /** 定期清扫过期桶（仅在定时到达或超上限时触发，均摊 O(1)） */
  private sweep(now: number): void {
    if (now < this.nextSweepAt && this.buckets.size <= this.maxEntries) return;
    for (const [ip, bucket] of this.buckets) {
      if (bucket.resetAt < now) this.buckets.delete(ip);
    }
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;
  }

  /** 超 [P-114] 上限时按插入序淘汰最旧，保证 Map 大小受控 */
  private enforceMax(): void {
    while (this.buckets.size > this.maxEntries) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

export class ConcurrencyGate {
  private inFlight = 0;

  constructor(private readonly max: number) {}

  /** 有空位则占用并返回 true；满则返回 false。 */
  tryAcquire(): boolean {
    if (this.inFlight >= this.max) return false;
    this.inFlight++;
    return true;
  }

  /** 释放一个占用；幂等，不会减到负数。 */
  release(): void {
    if (this.inFlight > 0) this.inFlight--;
  }

  current(): number {
    return this.inFlight;
  }
}