import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../utils/errors';

export function validate(validations: ValidationChain[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      next();
      return;
    }

    const formattedErrors = errors.array().map(error => ({
      field: 'path' in error ? error.path : 'unknown',
      message: error.msg,
    }));

    next(new ValidationError(formattedErrors));
  };
}
