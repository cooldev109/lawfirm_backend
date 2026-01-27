import { Request, Response, NextFunction } from 'express';
import { messageService } from '../services/messageService';
import { BadRequestError } from '../utils/errors';
import { UserRole } from '../types';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export const messageController = {
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;
      const { content } = req.body;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      if (!content || typeof content !== 'string') {
        throw new BadRequestError('Message content is required');
      }

      const message = await messageService.sendMessage(
        caseId,
        req.user.userId,
        req.user.role,
        content
      );

      res.status(201).json({
        success: true,
        data: message,
        message: 'Message sent successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async getMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const messages = await messageService.getMessagesByCaseId(
        caseId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const count = await messageService.getUnreadCountForCase(
        caseId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: { unread_count: count },
      });
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const count = await messageService.markMessagesAsRead(
        caseId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: { marked_count: count },
        message: `${count} messages marked as read`,
      });
    } catch (error) {
      next(error);
    }
  },
};
