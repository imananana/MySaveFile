import { Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so thrown errors are forwarded to Express's next()
// instead of becoming unhandled promise rejections.
export function asyncHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
