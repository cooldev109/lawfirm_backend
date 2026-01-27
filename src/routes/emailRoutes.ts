import { Router } from 'express';
import { emailController } from '../controllers/emailController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get emails for a specific case
router.get('/cases/:caseId', emailController.getCaseEmails);

// Get unassigned emails (admin/lawyer only)
router.get('/unassigned', authorize(UserRole.ADMIN, UserRole.LAWYER), emailController.getUnassignedEmails);

// Get single email
router.get('/:id', emailController.getEmail);

// Send email (lawyer/admin only)
router.post('/send', authorize(UserRole.ADMIN, UserRole.LAWYER), emailController.sendEmail);

// Assign email to case (lawyer/admin only)
router.post('/:id/assign', authorize(UserRole.ADMIN, UserRole.LAWYER), emailController.assignEmailToCase);

// Admin-only routes
// Manually check for new emails
router.post('/check', authorize(UserRole.ADMIN), emailController.checkEmails);

// Test SMTP connection
router.get('/test/smtp', authorize(UserRole.ADMIN), emailController.testSmtp);

// Test IMAP connection
router.get('/test/imap', authorize(UserRole.ADMIN), emailController.testImap);

export default router;
