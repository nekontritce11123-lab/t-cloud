import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler to catch errors and pass them to Express error handler.
 * Eliminates the need for try/catch in every route.
 *
 * Usage:
 * router.get('/', asyncHandler(async (req, res) => {
 *   const result = await someAsyncOperation();
 *   res.json(result);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[API] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
}

/**
 * Parse and validate ID parameter from request.
 * Returns the parsed number or sends 400 response.
 */
export function parseIdParam(req: Request, res: Response, paramName = 'id'): number | null {
  const id = parseInt(req.params[paramName], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: `Invalid ${paramName}` });
    return null;
  }
  return id;
}

/**
 * Standard pagination parameters parsing.
 */
export function parsePaginationParams(
  query: { page?: string; limit?: string },
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): { page: number; limit: number; offset: number } {
  const { page: defaultPage = 1, limit: defaultLimit = 20, maxLimit = 100 } = defaults;

  const page = Math.max(1, parseInt(query.page || String(defaultPage), 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || String(defaultLimit), 10)));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
