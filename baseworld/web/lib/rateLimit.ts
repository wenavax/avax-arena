/**
 * Basit in-memory token bucket rate limiter — per-IP.
 *
 * Notlar:
 *  - Tek-process'lik. Production'da Vercel Edge + Upstash Redis ile değiştir.
 *  - process restart edince state sıfırlanır.
 *  - Cold start sonrası bucket boş olur (kullanıcı için no-op).
 */
type Bucket = {tokens: number; updatedAt: number};

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  /** maksimum token sayısı (burst) */
  capacity: number;
  /** saniye başına eklenen token (rate) */
  refillPerSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** kalan token (allowed=true) veya retry-after saniye */
  remaining?: number;
  retryAfter?: number;
};

export function consume(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = {tokens: cfg.capacity, updatedAt: now};
    buckets.set(key, b);
  } else {
    const elapsedSec = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(cfg.capacity, b.tokens + elapsedSec * cfg.refillPerSec);
    b.updatedAt = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return {allowed: true, remaining: Math.floor(b.tokens)};
  }
  const tokensNeeded = 1 - b.tokens;
  const retryAfter = Math.ceil(tokensNeeded / cfg.refillPerSec);
  return {allowed: false, retryAfter};
}

/** IP key extractor — proxy header'larını trust et. */
export function getRateLimitKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
