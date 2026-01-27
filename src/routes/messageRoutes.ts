import { Router } from 'express';
import { messageController } from '../controllers/messageController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get messages for a case
router.get('/cases/:caseId', messageController.getMessages);

// Send message to a case
router.post('/cases/:caseId', messageController.sendMessage);

// Get unread count for a case
router.get('/cases/:caseId/unread', messageController.getUnreadCount);

// Mark messages as read for a case
router.post('/cases/:caseId/read', messageController.markAsRead);

export default router;
