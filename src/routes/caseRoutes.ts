import { Router } from 'express';
import { caseController } from '../controllers/caseController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// All case routes require authentication
router.use(authenticate);

// Get available lawyers (for case creation - must be before /:id route)
router.get('/available-lawyers', caseController.getAvailableLawyers);

// Dashboard stats (for all roles)
router.get('/stats', caseController.getStats);

// List cases (filtered by role)
router.get('/', ...caseController.list);

// Get single case
router.get('/:id', ...caseController.getById);

// Get case timeline
router.get('/:id/timeline', ...caseController.getTimeline);

// Create case (clients can create their own cases)
router.post('/', ...caseController.create);

// Update case (lawyers and admins only)
router.patch('/:id', authorize(UserRole.LAWYER, UserRole.ADMIN), ...caseController.update);

// Assign lawyer to case (admins only)
router.post('/:id/assign', authorize(UserRole.ADMIN), ...caseController.assignLawyer);

export default router;
