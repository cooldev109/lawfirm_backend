import { Router } from 'express';
import { lawyerController } from '../controllers/lawyerController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get lawyer's clients (lawyers see their clients, admins see all)
router.get(
  '/clients',
  authorize(UserRole.LAWYER, UserRole.ADMIN),
  lawyerController.getClients
);

// Get specific client details
router.get(
  '/clients/:clientId',
  authorize(UserRole.LAWYER, UserRole.ADMIN),
  lawyerController.getClientById
);

export default router;
