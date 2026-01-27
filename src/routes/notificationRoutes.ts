import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all notifications for current user
router.get('/', notificationController.getNotifications);

// Get unread notification count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark all notifications as read
router.post('/mark-all-read', notificationController.markAllAsRead);

// Mark a single notification as read
router.patch('/:id/read', notificationController.markAsRead);

// Delete a notification
router.delete('/:id', notificationController.deleteNotification);

export default router;
