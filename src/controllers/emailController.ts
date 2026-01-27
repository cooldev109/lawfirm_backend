import { Request, Response, NextFunction } from 'express';
import { emailService } from '../services/emailService';
import { imapService } from '../services/imapService';
import { query } from '../config/database';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { UserRole, JwtPayload } from '../types';
import { logger } from '../utils/logger';

interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const emailController = {
  // Get emails for a case
  async getCaseEmails(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;
      const user = req.user!;

      // Check access to case
      const caseAccess = await query(
        `SELECT c.id, c.client_id, c.lawyer_id, cl.user_id as client_user_id
         FROM cases c
         JOIN clients cl ON cl.id = c.client_id
         WHERE c.id = $1`,
        [caseId]
      );

      if (caseAccess.length === 0) {
        throw new NotFoundError('Case not found');
      }

      const caseData = caseAccess[0];

      // Only admins, assigned lawyers, or the client can view emails
      if (
        user.role !== UserRole.ADMIN &&
        user.id !== caseData.lawyer_id &&
        user.id !== caseData.client_user_id
      ) {
        throw new ForbiddenError('Access denied');
      }

      const emails = await query(
        `SELECT id, message_id, direction, sender, recipient, subject,
                body_text, received_at, sent_at, created_at
         FROM emails
         WHERE case_id = $1
         ORDER BY COALESCE(received_at, sent_at, created_at) DESC`,
        [caseId]
      );

      res.json({
        success: true,
        data: emails,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single email
  async getEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.user!;

      const emailResult = await query(
        `SELECT e.*, c.client_id, c.lawyer_id, cl.user_id as client_user_id
         FROM emails e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN clients cl ON cl.id = c.client_id
         WHERE e.id = $1`,
        [id]
      );

      if (emailResult.length === 0) {
        throw new NotFoundError('Email not found');
      }

      const email = emailResult[0];

      // Check access
      if (
        user.role !== UserRole.ADMIN &&
        user.id !== email.lawyer_id &&
        user.id !== email.client_user_id
      ) {
        throw new ForbiddenError('Access denied');
      }

      res.json({
        success: true,
        data: email,
      });
    } catch (error) {
      next(error);
    }
  },

  // Send email (for lawyers/admins)
  async sendEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { caseId, to, subject, body } = req.body;

      // Only admins and lawyers can send emails
      if (user.role === UserRole.CLIENT) {
        throw new ForbiddenError('Clients cannot send emails directly');
      }

      // If caseId provided, verify access
      if (caseId) {
        const caseAccess = await query(
          'SELECT id, lawyer_id FROM cases WHERE id = $1',
          [caseId]
        );

        if (caseAccess.length === 0) {
          throw new NotFoundError('Case not found');
        }

        if (user.role !== UserRole.ADMIN && user.id !== caseAccess[0].lawyer_id) {
          throw new ForbiddenError('Access denied');
        }
      }

      const result = await emailService.sendEmail({
        to,
        subject,
        text: body,
        html: `<div style="font-family: Arial, sans-serif;">${body.replace(/\n/g, '<br>')}</div>`,
      });

      // Log email in database
      if (caseId) {
        await emailService.logEmail(caseId, to, subject, result.success ? 'sent' : 'failed');
      }

      res.json({
        success: result.success,
        data: {
          messageId: result.messageId,
        },
        error: result.error,
      });
    } catch (error) {
      next(error);
    }
  },

  // Manually trigger email check (admin only)
  async checkEmails(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const emails = await imapService.fetchUnreadEmails();
      const results = [];

      for (const email of emails) {
        const result = await imapService.processEmail(email);
        results.push({
          subject: email.subject,
          from: email.from,
          ...result,
        });
      }

      res.json({
        success: true,
        data: {
          processed: results.length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get unassigned emails (no case match)
  async getUnassignedEmails(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      if (user.role !== UserRole.ADMIN && user.role !== UserRole.LAWYER) {
        throw new ForbiddenError('Access denied');
      }

      const emails = await query(
        `SELECT id, message_id, direction, sender, recipient, subject,
                body_text, received_at, created_at
         FROM emails
         WHERE case_id IS NULL AND direction = 'inbound'
         ORDER BY received_at DESC
         LIMIT 50`
      );

      res.json({
        success: true,
        data: emails,
      });
    } catch (error) {
      next(error);
    }
  },

  // Assign email to case
  async assignEmailToCase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { caseId } = req.body;

      if (user.role !== UserRole.ADMIN && user.role !== UserRole.LAWYER) {
        throw new ForbiddenError('Access denied');
      }

      // Verify email exists
      const emailResult = await query('SELECT id FROM emails WHERE id = $1', [id]);
      if (emailResult.length === 0) {
        throw new NotFoundError('Email not found');
      }

      // Verify case exists
      const caseResult = await query('SELECT id, case_number FROM cases WHERE id = $1', [caseId]);
      if (caseResult.length === 0) {
        throw new NotFoundError('Case not found');
      }

      // Update email
      await query('UPDATE emails SET case_id = $1, updated_at = NOW() WHERE id = $2', [caseId, id]);

      logger.info(`Email ${id} assigned to case ${caseId} by user ${user.id}`);

      res.json({
        success: true,
        data: {
          emailId: id,
          caseId,
          caseNumber: caseResult[0].case_number,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Test SMTP connection
  async testSmtp(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const verified = await emailService.verifyConnection();

      res.json({
        success: true,
        data: {
          smtp_configured: verified,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Test IMAP connection
  async testImap(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const connected = await imapService.connect();
      await imapService.disconnect();

      res.json({
        success: true,
        data: {
          imap_configured: connected,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
