/**
 * Express middleware that validates `req.body` against a zod schema.
 *
 * Usage:
 *   const PatchBody = z.object({ status: z.string().optional(), ... });
 *   router.patch('/:id', validateBody(PatchBody), asyncHandler(async (req, res) => {
 *     // req.body is now typed as z.infer<typeof PatchBody>
 *   }));
 *
 * On failure, responds with 400 + a structured error listing the first failing
 * path. We keep the response shape simple (`{ error: string }`) to match the
 * rest of the API.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join('.') || '(root)';
      res.status(400).json({ error: `Invalid body at ${path}: ${issue?.message ?? 'unknown'}` });
      return;
    }
    req.body = result.data;
    next();
  };
}
