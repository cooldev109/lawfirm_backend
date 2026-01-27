import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      errors: err.errors,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Log unexpected errors
  logger.error('Unexpected error:', err);

  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested resource does not exist',
  });
}
