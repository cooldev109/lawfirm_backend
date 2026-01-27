import { query } from '../config/database';
import { caseRepository, caseEventRepository } from '../repositories/caseRepository';
import { emailNotificationService } from '../services/emailNotificationService';
import { notificationService, NotificationType } from '../services/notificationService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { CaseEventType } from '../types';

interface InactiveCase {
  id: string;
  case_number: string;
  title: string;
  status: string;
  last_activity_at: Date;
  last_inactivity_notification: Date | null;
  client_user_id: string;
  client_email: string;
  client_first_name: string;
  client_last_name: string;
  lawyer_name: string | null;
}

export const inactivityCheckJob = {
  async run(): Promise<void> {
    const daysThreshold = config.business.inactivityDaysThreshold || 21;
    logger.info(`Starting inactivity check job (threshold: ${daysThreshold} days)...`);

    // Get inactive cases that haven't been notified recently
    const inactiveCases = await this.getInactiveCasesForNotification(daysThreshold);
    logger.info(`Found ${inactiveCases.length} inactive cases needing notification`);

    let successCount = 0;
    let failCount = 0;

    for (const caseRecord of inactiveCases) {
      try {
        await this.sendInactivityNotification(caseRecord, daysThreshold);
        await this.updateNotificationTimestamp(caseRecord.id);
        await this.logInactivityEvent(caseRecord);
        successCount++;
        logger.info(`Inactivity notification sent for case ${caseRecord.case_number}`);
      } catch (error) {
        failCount++;
        logger.error(`Failed to send inactivity notification for case ${caseRecord.case_number}:`, error);
      }
    }

    logger.info(`Inactivity check completed: ${successCount} notifications sent, ${failCount} failed`);
  },

  async getInactiveCasesForNotification(daysThreshold: number): Promise<InactiveCase[]> {
    // Get cases that:
    // 1. Are not closed/archived/resolved
    // 2. Have no activity for X days
    // 3. Haven't been notified in the last 7 days (to prevent spam)
    return query<InactiveCase>(
      `SELECT
        c.id, c.case_number, c.title, c.status, c.last_activity_at, c.last_inactivity_notification,
        u.id as client_user_id, u.email as client_email, u.first_name as client_first_name, u.last_name as client_last_name,
        CONCAT(lu.first_name, ' ', lu.last_name) as lawyer_name
       FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       JOIN users u ON cl.user_id = u.id
       LEFT JOIN lawyers l ON c.lawyer_id = l.id
       LEFT JOIN users lu ON l.user_id = lu.id
       WHERE c.status NOT IN ('closed', 'archived', 'resolved')
       AND c.last_activity_at < NOW() - INTERVAL '1 day' * $1
       AND (c.last_inactivity_notification IS NULL
            OR c.last_inactivity_notification < NOW() - INTERVAL '7 days')
       ORDER BY c.last_activity_at ASC`,
      [daysThreshold]
    );
  },

  async sendInactivityNotification(caseRecord: InactiveCase, daysThreshold: number): Promise<void> {
    const clientName = `${caseRecord.client_first_name} ${caseRecord.client_last_name}`;
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(caseRecord.last_activity_at).getTime()) / (24 * 60 * 60 * 1000)
    );

    // Send in-app notification
    await notificationService.create({
      userId: caseRecord.client_user_id,
      type: NotificationType.SYSTEM_ALERT,
      title: 'Case Update Needed',
      message: `Your case ${caseRecord.case_number} has had no activity for ${daysSinceActivity} days. Please log in to review or contact your attorney.`,
      caseId: caseRecord.id,
    });

    // Send email notification
    await emailNotificationService.sendInactivityReminder(
      caseRecord.client_email,
      clientName,
      caseRecord.case_number,
      caseRecord.title,
      daysSinceActivity,
      caseRecord.lawyer_name,
      caseRecord.id
    );
  },

  async updateNotificationTimestamp(caseId: string): Promise<void> {
    await query(
      `UPDATE cases SET last_inactivity_notification = NOW() WHERE id = $1`,
      [caseId]
    );
  },

  async logInactivityEvent(caseRecord: InactiveCase): Promise<void> {
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(caseRecord.last_activity_at).getTime()) / (24 * 60 * 60 * 1000)
    );

    await caseEventRepository.create({
      case_id: caseRecord.id,
      event_type: CaseEventType.DEADLINE_REMINDER,
      description: `Inactivity reminder sent to client (${daysSinceActivity} days inactive)`,
      metadata: {
        days_inactive: daysSinceActivity,
        notification_type: 'inactivity_reminder',
        client_email: caseRecord.client_email,
      },
    });
  },
};
