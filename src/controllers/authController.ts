import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/authService';
import { validate } from '../middleware/validate';

export const authValidation = {
  registerClient: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('company_name').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('state').optional().trim(),
    body('zip_code').optional().trim(),
    body('country').optional().trim(),
  ],
  registerLawyer: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('bar_number').optional().trim(),
    body('specialization').optional().trim(),
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  changePassword: [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  updateProfile: [
    body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
    body('phone').optional().trim(),
    body('bar_number').optional().trim(),
    body('specialization').optional().trim(),
    body('is_available').optional().isBoolean().withMessage('is_available must be a boolean'),
    body('max_cases').optional().isInt({ min: 1, max: 200 }).withMessage('max_cases must be between 1 and 200'),
  ],
};

export const authController = {
  registerClient: [
    validate(authValidation.registerClient),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await authService.registerClient(req.body);
        res.status(201).json({
          success: true,
          data: result,
          message: 'Registration successful',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  registerLawyer: [
    validate(authValidation.registerLawyer),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await authService.registerLawyer(req.body);
        res.status(201).json({
          success: true,
          data: result,
          message: 'Registration successful',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  login: [
    validate(authValidation.login),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await authService.login(req.body);
        res.json({
          success: true,
          data: result,
          message: 'Login successful',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  getProfile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await authService.getProfile(req.user!.userId);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  changePassword: [
    validate(authValidation.changePassword),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await authService.changePassword(
          req.user!.userId,
          req.body.current_password,
          req.body.new_password
        );
        res.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  updateProfile: [
    validate(authValidation.updateProfile),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await authService.updateProfile(req.user!.userId, req.body);
        res.json({
          success: true,
          data: result,
          message: 'Profile updated successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],
};
