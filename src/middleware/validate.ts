import { ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * On success it calls `next()`. On failure it responds with HTTP 422
 * and a JSON body containing the validation errors.
 */
export const validate = (schema: ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error: 'Validation error',
        details: result.error.format(),
      });
    }
    // replace the body with the parsed data (typed version)
    req.body = result.data;
    next();
  };
};
