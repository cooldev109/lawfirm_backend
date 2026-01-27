import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notificationService';
import { NotFoundError } from '../utils/errors';

export const notificationController = {
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const unreadOnly = req.query.unread === 'true';

      const notifications = await notificationService.getByUserId(userId, unreadOnly);

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const count = await notificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const notification = await notificationService.markAsRead(id, userId);

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  },

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await notificationService.markAllAsRead(userId);

      res.json({
        success: true,
        message: 'All notifications marked as read',
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const deleted = await notificationService.delete(id, userId);

      if (!deleted) {
        throw new NotFoundError('Notification not found');
      }

      res.json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error) {
      next(error);
    }
  },
};
