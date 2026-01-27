import { Request, Response, NextFunction } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { adminService } from '../services/adminService';
import { validate } from '../middleware/validate';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import { UserRole } from '../types';
import { triggerWeeklySummary, triggerInactivityCheck } from '../scheduledJobs';

// Middleware to check admin role
const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
};

export const adminValidation = {
  createUser: [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['admin', 'lawyer', 'client']).withMessage('Invalid role'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('bar_number').optional().trim(),
    body('specialization').optional().trim(),
    body('max_cases').optional().isInt({ min: 1 }).withMessage('Max cases must be a positive integer'),
    body('company_name').optional().trim(),
  ],
  updateUser: [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('first_name').optional().trim().notEmpty(),
    body('last_name').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('email').optional().isEmail(),
  ],
  updateLawyer: [
    param('id').isUUID().withMessage('Invalid lawyer ID'),
    body('bar_number').optional().trim(),
    body('specialization').optional().trim(),
    body('is_available').optional().isBoolean(),
    body('max_cases').optional().isInt({ min: 1 }),
  ],
  listUsers: [
    queryValidator('role').optional().isIn(['admin', 'lawyer', 'client']).withMessage('Invalid role'),
  ],
  listCases: [
    queryValidator('status').optional().trim(),
    queryValidator('lawyer_id').optional().isUUID(),
    queryValidator('client_id').optional().isUUID(),
  ],
};

export const adminController = {
  // Get system statistics
  getStats: [
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const stats = await adminService.getSystemStats();
        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Get all users
  listUsers: [
    requireAdmin,
    validate(adminValidation.listUsers),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const role = req.query.role as UserRole | undefined;
        const users = await adminService.getAllUsers(role);
        res.json({
          success: true,
          data: users,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Get single user
  getUser: [
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await adminService.getUserById(req.params.id);
        if (!user) {
          throw new NotFoundError('User not found');
        }
        res.json({
          success: true,
          data: user,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Create new user
  createUser: [
    requireAdmin,
    validate(adminValidation.createUser),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await adminService.createUser({
          email: req.body.email,
          password: req.body.password,
          role: req.body.role,
          first_name: req.body.first_name,
          last_name: req.body.last_name,
          phone: req.body.phone,
          bar_number: req.body.bar_number,
          specialization: req.body.specialization,
          max_cases: req.body.max_cases,
          company_name: req.body.company_name,
        });

        res.status(201).json({
          success: true,
          data: user,
          message: 'User created successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Update user
  updateUser: [
    requireAdmin,
    validate(adminValidation.updateUser),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await adminService.updateUser(req.params.id, {
          first_name: req.body.first_name,
          last_name: req.body.last_name,
          phone: req.body.phone,
          email: req.body.email,
        });

        if (!user) {
          throw new NotFoundError('User not found');
        }

        res.json({
          success: true,
          data: user,
          message: 'User updated successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Toggle user active status
  toggleUserActive: [
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await adminService.toggleUserActive(req.params.id);

        if (!user) {
          throw new NotFoundError('User not found');
        }

        res.json({
          success: true,
          data: user,
          message: `User ${user.is_active ? 'activated' : 'deactivated'} successfully`,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Delete user
  deleteUser: [
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.params.id;

        // Prevent admin from deleting themselves
        if (req.user?.id === userId) {
          throw new BadRequestError('Cannot delete your own account');
        }

        const result = await adminService.deleteUser(userId);

        if (!result.success) {
          throw new BadRequestError(result.error || 'Failed to delete user');
        }

        res.json({
          success: true,
          message: 'User deleted successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Get all lawyers
  listLawyers: [
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lawyers = await adminService.getAllLawyers();
        res.json({
          success: true,
          data: lawyers,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Update lawyer
  updateLawyer: [
    requireAdmin,
    validate(adminValidation.updateLawyer),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lawyer = await adminService.updateLawyer(req.params.id, {
          bar_number: req.body.bar_number,
          specialization: req.body.specialization,
          is_available: req.body.is_available,
          max_cases: req.body.max_cases,
        });

        if (!lawyer) {
          throw new NotFoundError('Lawyer not found');
        }

        res.json({
          success: true,
          data: lawyer,
          message: 'Lawyer updated successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Get all cases (admin view)
  listCases: [
    requireAdmin,
    validate(adminValidation.listCases),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const cases = await adminService.getAllCases({
          status: req.query.status as string | undefined,
          lawyer_id: req.query.lawyer_id as string | undefined,
          client_id: req.query.client_id as string | undefined,
        });

        res.json({
          success: true,
          data: cases,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Trigger weekly summary job manually
  triggerWeeklySummary: [
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await triggerWeeklySummary();
        res.json({
          success: true,
          message: 'Weekly summary job triggered successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  // Trigger inactivity check job manually
  triggerInactivityCheck: [
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await triggerInactivityCheck();
        res.json({
          success: true,
          message: 'Inactivity check job triggered successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],
};
