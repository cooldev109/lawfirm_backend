import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { emailTemplateController } from '../controllers/emailTemplateController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// System stats
router.get('/stats', adminController.getStats);

// User management
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);
router.patch('/users/:id/toggle-active', adminController.toggleUserActive);
router.delete('/users/:id', adminController.deleteUser);

// Lawyer management
router.get('/lawyers', adminController.listLawyers);
router.patch('/lawyers/:id', adminController.updateLawyer);

// Case management (admin view of all cases)
router.get('/cases', adminController.listCases);

// Scheduled job triggers (for testing/manual execution)
router.post('/jobs/weekly-summary', adminController.triggerWeeklySummary);
router.post('/jobs/inactivity-check', adminController.triggerInactivityCheck);

// Email template management
router.get('/email-templates', emailTemplateController.getAllTemplates);
router.get('/email-templates/:id', emailTemplateController.getTemplate);
router.patch('/email-templates/:id', emailTemplateController.updateTemplate);
router.post('/email-templates/:id/reset', emailTemplateController.resetTemplate);
router.post('/email-templates/:id/preview', emailTemplateController.previewTemplate);
router.get('/email-templates/:id/sample-data', emailTemplateController.getSampleData);

export default router;
