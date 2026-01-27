import { query } from '../config/database';
import { emailNotificationService } from '../services/emailNotificationService';
import { logger } from '../utils/logger';
import { CaseStatus } from '../types';

interface LawyerSummary {
  lawyerId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  totalCases: number;
  activeCases: number;
  newCasesThisWeek: number;
  closedCasesThisWeek: number;
  casesNeedingAttention: number;
  cases: CaseSummaryItem[];
}

interface CaseSummaryItem {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  clientName: string;
  lastActivityAt: Date;
  daysSinceActivity: number;
  needsAttention: boolean;
}

export const weeklySummaryJob = {
  async run(): Promise<void> {
    logger.info('Starting weekly summary job...');

    // Get all active lawyers
    const lawyers = await this.getActiveLawyers();
    logger.info(`Found ${lawyers.length} active lawyers`);

    let successCount = 0;
    let failCount = 0;

    for (const lawyer of lawyers) {
      try {
        // Get summary data for this lawyer
        const summary = await this.getLawyerSummary(lawyer.id, lawyer.user_id, lawyer.email, lawyer.first_name, lawyer.last_name);

        if (summary.totalCases === 0) {
          logger.info(`Skipping ${lawyer.email} - no assigned cases`);
          continue;
        }

        // Send the summary email
        await this.sendSummaryEmail(summary);
        successCount++;
        logger.info(`Weekly summary sent to ${lawyer.email}`);
      } catch (error) {
        failCount++;
        logger.error(`Failed to send weekly summary to ${lawyer.email}:`, error);
      }
    }

    logger.info(`Weekly summary job completed: ${successCount} sent, ${failCount} failed`);
  },

  async getActiveLawyers(): Promise<Array<{
    id: string;
    user_id: string;
    email: string;
    first_name: string;
    last_name: string;
  }>> {
    return query(
      `SELECT l.id, l.user_id, u.email, u.first_name, u.last_name
       FROM lawyers l
       JOIN users u ON l.user_id = u.id
       WHERE u.is_active = true AND l.is_available = true
       ORDER BY u.last_name, u.first_name`
    );
  },

  async getLawyerSummary(
    lawyerId: string,
    userId: string,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<LawyerSummary> {
    // Get all cases assigned to this lawyer
    const cases = await query<{
      id: string;
      case_number: string;
      title: string;
      status: string;
      client_first_name: string;
      client_last_name: string;
      last_activity_at: Date;
      created_at: Date;
      closed_at: Date | null;
    }>(
      `SELECT c.id, c.case_number, c.title, c.status, c.last_activity_at, c.created_at, c.closed_at,
              u.first_name as client_first_name, u.last_name as client_last_name
       FROM cases c
       JOIN clients cl ON c.client_id = cl.id
       JOIN users u ON cl.user_id = u.id
       WHERE c.lawyer_id = $1
       ORDER BY c.last_activity_at DESC`,
      [lawyerId]
    );

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const activeStatuses = [CaseStatus.NEW, CaseStatus.IN_PROGRESS, CaseStatus.PENDING_REVIEW, CaseStatus.ON_HOLD];

    let activeCases = 0;
    let newCasesThisWeek = 0;
    let closedCasesThisWeek = 0;
    let casesNeedingAttention = 0;

    const caseSummaries: CaseSummaryItem[] = cases.map(c => {
      const lastActivity = new Date(c.last_activity_at);
      const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000));
      const isActive = activeStatuses.includes(c.status as CaseStatus);
      const needsAttention = isActive && daysSinceActivity > 7;

      if (isActive) activeCases++;
      if (new Date(c.created_at) >= oneWeekAgo) newCasesThisWeek++;
      if (c.closed_at && new Date(c.closed_at) >= oneWeekAgo) closedCasesThisWeek++;
      if (needsAttention) casesNeedingAttention++;

      return {
        id: c.id,
        caseNumber: c.case_number,
        title: c.title,
        status: c.status,
        clientName: `${c.client_first_name} ${c.client_last_name}`,
        lastActivityAt: lastActivity,
        daysSinceActivity,
        needsAttention,
      };
    });

    return {
      lawyerId,
      userId,
      email,
      firstName,
      lastName,
      totalCases: cases.length,
      activeCases,
      newCasesThisWeek,
      closedCasesThisWeek,
      casesNeedingAttention,
      cases: caseSummaries,
    };
  },

  async sendSummaryEmail(summary: LawyerSummary): Promise<void> {
    const lawyerName = `${summary.firstName} ${summary.lastName}`;

    // Build the cases needing attention section
    const attentionCases = summary.cases
      .filter(c => c.needsAttention)
      .slice(0, 10); // Limit to 10

    // Build the active cases section
    const activeCases = summary.cases
      .filter(c => !['closed', 'archived', 'resolved'].includes(c.status))
      .slice(0, 15); // Limit to 15

    await emailNotificationService.sendWeeklySummary(
      summary.email,
      lawyerName,
      {
        totalCases: summary.totalCases,
        activeCases: summary.activeCases,
        newCasesThisWeek: summary.newCasesThisWeek,
        closedCasesThisWeek: summary.closedCasesThisWeek,
        casesNeedingAttention: summary.casesNeedingAttention,
      },
      attentionCases,
      activeCases
    );
  },
};
