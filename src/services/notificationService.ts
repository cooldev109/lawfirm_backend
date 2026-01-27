import { query } from '../config/database';
import { logger } from '../utils/logger';
import { emailNotificationService } from './emailNotificationService';

export enum NotificationType {
  NEW_CASE = 'new_case',
  CASE_UPDATE = 'case_update',
  DOCUMENT_UPLOADED = 'document_uploaded',
  MESSAGE_RECEIVED = 'message_received',
  CASE_ASSIGNED = 'case_assigned',
  DEADLINE_REMINDER = 'deadline_reminder',
  SYSTEM_ALERT = 'system_alert',
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  case_id?: string;
  is_read: boolean;
  created_at: Date;
  read_at?: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  caseId?: string;
}

export const notificationService = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, message, case_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.userId, input.type, input.title, input.message, input.caseId || null]
    );
    logger.info(`Notification created for user ${input.userId}: ${input.title}`);
    return result[0];
  },

  async getByUserId(userId: string, unreadOnly: boolean = false): Promise<Notification[]> {
    let sql = `SELECT * FROM notifications WHERE user_id = $1`;
    if (unreadOnly) {
      sql += ` AND is_read = false`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    return await query(sql, [userId]);
  },

  async getUnreadCount(userId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return parseInt(result[0].count, 10);
  },

  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result[0] || null;
  },

  async markAllAsRead(userId: string): Promise<number> {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return result.length;
  },

  async delete(notificationId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [notificationId, userId]
    );
    return result.length > 0;
  },

  // Helper method to notify lawyer about new case
  async notifyLawyerNewCase(
    lawyerId: string,
    clientName: string,
    caseNumber: string,
    caseType: string,
    caseId: string
  ): Promise<void> {
    // Get lawyer's user_id and email
    const lawyers = await query(
      `SELECT l.user_id, u.email, u.first_name, u.last_name
       FROM lawyers l
       JOIN users u ON l.user_id = u.id
       WHERE l.id = $1`,
      [lawyerId]
    );

    if (lawyers.length === 0) {
      logger.warn(`Lawyer not found for notification: ${lawyerId}`);
      return;
    }

    const { user_id: userId, email, first_name, last_name } = lawyers[0];
    const lawyerName = `${first_name} ${last_name}`;
    const caseTypeFormatted = caseType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Get case title
    const cases = await query(`SELECT title FROM cases WHERE id = $1`, [caseId]);
    const caseTitle = cases[0]?.title || 'New Case';

    // Create in-app notification
    await this.create({
      userId,
      type: NotificationType.NEW_CASE,
      title: 'New Case Assigned',
      message: `You have been assigned a new ${caseTypeFormatted} case (${caseNumber}) from ${clientName}.`,
      caseId,
    });

    // Send email notification (non-blocking)
    emailNotificationService.notifyCaseAssignedToLawyer(
      email,
      lawyerName,
      clientName,
      caseNumber,
      caseTitle,
      caseType,
      caseId
    ).catch(err => logger.warn('Failed to send email to lawyer:', err));
  },

  // Helper method to notify admins about new case
  async notifyAdminsNewCase(
    clientName: string,
    caseNumber: string,
    caseType: string,
    caseId: string,
    lawyerName?: string
  ): Promise<void> {
    // Get all admin user IDs
    const admins = await query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
    );

    const caseTypeFormatted = caseType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const assignedTo = lawyerName ? ` Assigned to ${lawyerName}.` : ' No lawyer assigned yet.';

    for (const admin of admins) {
      await this.create({
        userId: admin.id,
        type: NotificationType.NEW_CASE,
        title: 'New Case Submitted',
        message: `New ${caseTypeFormatted} case (${caseNumber}) submitted by ${clientName}.${assignedTo}`,
        caseId,
      });
    }
  },

  // Helper method to notify client about case creation
  async notifyClientCaseCreated(
    userId: string,
    caseNumber: string,
    caseType: string,
    caseId: string,
    lawyerName?: string
  ): Promise<void> {
    const caseTypeFormatted = caseType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const assignedMsg = lawyerName
      ? `Your attorney ${lawyerName} will be in touch soon.`
      : 'A lawyer will be assigned to your case shortly.';

    await this.create({
      userId,
      type: NotificationType.NEW_CASE,
      title: 'Case Submitted Successfully',
      message: `Your ${caseTypeFormatted} case (${caseNumber}) has been submitted. ${assignedMsg}`,
      caseId,
    });
  },

  // Helper method to notify client about case status update
  async notifyClientCaseStatusUpdate(
    caseId: string,
    newStatus: string,
    caseNumber: string,
    oldStatus?: string
  ): Promise<void> {
    // Get client info from case
    const cases = await query(
      `SELECT c.client_id, c.title, c.status, cl.user_id, u.email, u.first_name, u.last_name
       FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       JOIN users u ON cl.user_id = u.id
       WHERE c.id = $1`,
      [caseId]
    );

    if (cases.length === 0) {
      logger.warn(`Case not found for notification: ${caseId}`);
      return;
    }

    const { user_id: userId, email, first_name, last_name, title: caseTitle, status: currentStatus } = cases[0];
    const clientName = `${first_name} ${last_name}`;
    const statusFormatted = newStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Create in-app notification
    await this.create({
      userId,
      type: NotificationType.CASE_UPDATE,
      title: 'Case Status Updated',
      message: `Your case ${caseNumber} status has been updated to: ${statusFormatted}.`,
      caseId,
    });

    // Send email notification (non-blocking)
    emailNotificationService.notifyCaseStatusChanged(
      email,
      clientName,
      caseNumber,
      caseTitle,
      oldStatus || currentStatus,
      newStatus,
      caseId
    ).catch(err => logger.warn('Failed to send status update email to client:', err));
  },

  // Helper method to notify client about document upload
  async notifyClientDocumentUploaded(
    caseId: string,
    caseNumber: string,
    uploaderName: string,
    documentName: string
  ): Promise<void> {
    // Get client user_id from case
    const cases = await query(
      `SELECT c.client_id, cl.user_id FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1`,
      [caseId]
    );

    if (cases.length === 0) {
      logger.warn(`Case not found for document notification: ${caseId}`);
      return;
    }

    const userId = cases[0].user_id;

    await this.create({
      userId,
      type: NotificationType.DOCUMENT_UPLOADED,
      title: 'New Document Added',
      message: `${uploaderName} uploaded "${documentName}" to case ${caseNumber}.`,
      caseId,
    });
  },

  // Helper method to notify lawyer about document upload
  async notifyLawyerDocumentUploaded(
    caseId: string,
    caseNumber: string,
    uploaderName: string,
    documentName: string
  ): Promise<void> {
    // Get lawyer user_id from case
    const cases = await query(
      `SELECT c.lawyer_id, l.user_id FROM cases c
       JOIN lawyers l ON c.lawyer_id = l.id
       WHERE c.id = $1 AND c.lawyer_id IS NOT NULL`,
      [caseId]
    );

    if (cases.length === 0) {
      return; // No lawyer assigned
    }

    const userId = cases[0].user_id;

    await this.create({
      userId,
      type: NotificationType.DOCUMENT_UPLOADED,
      title: 'Client Uploaded Document',
      message: `${uploaderName} uploaded "${documentName}" to case ${caseNumber}.`,
      caseId,
    });
  },

  // Helper method to notify client when lawyer is assigned
  async notifyClientLawyerAssigned(
    caseId: string,
    caseNumber: string,
    lawyerName: string
  ): Promise<void> {
    // Get client info from case
    const cases = await query(
      `SELECT c.client_id, c.title, cl.user_id, u.email, u.first_name, u.last_name
       FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       JOIN users u ON cl.user_id = u.id
       WHERE c.id = $1`,
      [caseId]
    );

    if (cases.length === 0) {
      logger.warn(`Case not found for lawyer assignment notification: ${caseId}`);
      return;
    }

    const { user_id: userId, email, first_name, last_name, title: caseTitle } = cases[0];
    const clientName = `${first_name} ${last_name}`;

    // Create in-app notification
    await this.create({
      userId,
      type: NotificationType.CASE_ASSIGNED,
      title: 'Lawyer Assigned',
      message: `${lawyerName} has been assigned to your case ${caseNumber}. They will contact you soon.`,
      caseId,
    });

    // Send email notification (non-blocking)
    emailNotificationService.notifyLawyerAssigned(
      email,
      clientName,
      lawyerName,
      caseNumber,
      caseTitle,
      caseId
    ).catch(err => logger.warn('Failed to send lawyer assigned email to client:', err));
  },

  // Helper method to notify about new message
  async notifyNewMessage(
    caseId: string,
    caseNumber: string,
    senderId: string,
    senderName: string,
    messageContent: string
  ): Promise<void> {
    // Get case info with client and lawyer
    const cases = await query(
      `SELECT c.client_id, c.lawyer_id, c.title,
              cl.user_id as client_user_id, cu.email as client_email, cu.first_name as client_first_name, cu.last_name as client_last_name,
              l.user_id as lawyer_user_id, lu.email as lawyer_email, lu.first_name as lawyer_first_name, lu.last_name as lawyer_last_name
       FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       JOIN users cu ON cl.user_id = cu.id
       LEFT JOIN lawyers l ON c.lawyer_id = l.id
       LEFT JOIN users lu ON l.user_id = lu.id
       WHERE c.id = $1`,
      [caseId]
    );

    if (cases.length === 0) {
      logger.warn(`Case not found for message notification: ${caseId}`);
      return;
    }

    const caseInfo = cases[0];
    const caseTitle = caseInfo.title;

    // Determine recipient (notify the other party)
    const isFromClient = senderId === caseInfo.client_user_id;

    if (isFromClient && caseInfo.lawyer_user_id) {
      // Client sent message, notify lawyer
      const lawyerName = `${caseInfo.lawyer_first_name} ${caseInfo.lawyer_last_name}`;

      await this.create({
        userId: caseInfo.lawyer_user_id,
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'New Message',
        message: `${senderName} sent a message on case ${caseNumber}.`,
        caseId,
      });

      emailNotificationService.notifyNewMessage(
        caseInfo.lawyer_email,
        lawyerName,
        senderName,
        caseNumber,
        caseTitle,
        messageContent,
        caseId,
        false // recipient is lawyer
      ).catch(err => logger.warn('Failed to send message email to lawyer:', err));

    } else if (!isFromClient) {
      // Lawyer/Admin sent message, notify client
      const clientName = `${caseInfo.client_first_name} ${caseInfo.client_last_name}`;

      await this.create({
        userId: caseInfo.client_user_id,
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'New Message',
        message: `${senderName} sent a message on case ${caseNumber}.`,
        caseId,
      });

      emailNotificationService.notifyNewMessage(
        caseInfo.client_email,
        clientName,
        senderName,
        caseNumber,
        caseTitle,
        messageContent,
        caseId,
        true // recipient is client
      ).catch(err => logger.warn('Failed to send message email to client:', err));
    }
  },
};
