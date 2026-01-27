import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, authorize } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { UserRole } from '../types';

const router = Router();

// Public routes with rate limiting
router.post('/register', authLimiter, ...authController.registerClient);
router.post('/register/lawyer', authLimiter, ...authController.registerLawyer);
router.post('/login', authLimiter, ...authController.login);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.patch('/profile', authenticate, ...authController.updateProfile);
router.post('/change-password', authenticate, ...authController.changePassword);

// Admin-only routes for creating lawyers
router.post(
  '/admin/register-lawyer',
  authenticate,
  authorize(UserRole.ADMIN),
  ...authController.registerLawyer
);

export default router;
