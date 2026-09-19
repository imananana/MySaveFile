/**
 * Minimal in-memory fixed-window rate limiter. No external dependency, no store
 * — fine for a single-instance deployment at launch volume. If the app scales
 * to multiple instances, swap the Map for a shared store (Redis) behind the
 * same interface. (Tracked as G4 in the launch plan: generalize across auth.)
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Derive the bucket key from the request (default: client IP). */
  keyFn?: (req: Request) => string;
}

export function rateLimit({ windowMs, max, keyFn }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  // Opportunistic cleanup so the Map doesn't grow unbounded.
  function sweep(now: number) {
    if (buckets.size < 5000) return;
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : (req.ip ?? 'unknown');
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      // The wait goes in the BODY as well as the header: a screen that turns a
      // refusal into "this link expired" sends someone off to request another
      // link they also can't use. `retryAfter` is what lets it say the truth.
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many attempts. Try again shortly.', retryAfter });
      return;
    }

    sweep(now);
    next();
  };
}
