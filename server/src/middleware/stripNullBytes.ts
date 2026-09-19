import { NextFunction, Request, Response } from 'express';

/**
 * Postgres text columns reject NUL (\u0000) outright — "invalid byte sequence
 * for encoding UTF8: 0x00" — and one NUL anywhere in a request aborts that
 * insert. Non-English saves can carry NULs inside parsed text fields (first
 * seen on a Russian-locale save, where they broke every import attempt), and
 * the browser-side import applies entities call-by-call, so one poisoned
 * string either drops that entity silently or kills the import midway.
 *
 * NUL never appears in legitimate text, so it is stripped — not rejected — at
 * the door, for every route at once. Only strings are rewritten; structure,
 * numbers, booleans and nulls pass through untouched.
 */
export function stripNullBytes<T>(value: T): T {
  if (typeof value === 'string') {
    // Scan before replace: the common case (no NUL) allocates nothing.
    return (value.includes('\u0000') ? value.replace(/\u0000/g, '') : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(stripNullBytes) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripNullBytes(v);
    return out as T;
  }
  return value;
}

/** Express middleware: scrub every string in a parsed JSON body. */
export function stripNullBytesBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = stripNullBytes(req.body);
  }
  next();
}
