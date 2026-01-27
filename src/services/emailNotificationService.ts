import { Resend } from 'resend';
import { config } from '../config';
import { logger } from '../utils/logger';

// Initialize Resend client
const resend = new Resend(config.resend.apiKey);

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
};

// Utility function for exponential backoff delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Calculate delay with exponential backoff and jitter
const getRetryDelay = (attempt: number): number => {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
};

// Email templates
const templates = {
  caseSubmitted: (data: { clientName: string; caseNumber: string; caseTitle: string }) => ({
    subject: `New Case Submitted: ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">New Case Submitted</h2>
        <p>Hello ${data.clientName},</p>
        <p>Your case has been successfully submitted to our system.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p style="margin: 8px 0 0;"><strong>Title:</strong> ${data.caseTitle}</p>
        </div>
        <p>Our team will review your case and get back to you shortly.</p>
        <p>You can track your case status by logging into your client portal.</p>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  caseStatusChanged: (data: { clientName: string; caseNumber: string; caseTitle: string; oldStatus: string; newStatus: string; portalUrl: string }) => ({
    subject: `Case Status Update: ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Case Status Update</h2>
        <p>Hello ${data.clientName},</p>
        <p>The status of your case has been updated.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p style="margin: 8px 0 0;"><strong>Title:</strong> ${data.caseTitle}</p>
          <p style="margin: 8px 0 0;"><strong>Previous Status:</strong> ${data.oldStatus}</p>
          <p style="margin: 8px 0 0;"><strong>New Status:</strong> <span style="color: #2b6cb0; font-weight: bold;">${data.newStatus}</span></p>
        </div>
        <p>Log in to your portal to view more details:</p>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Case</a>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  newMessage: (data: { recipientName: string; senderName: string; caseNumber: string; caseTitle: string; messagePreview: string; portalUrl: string }) => ({
    subject: `New Message on Case ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">New Message Received</h2>
        <p>Hello ${data.recipientName},</p>
        <p>You have received a new message from <strong>${data.senderName}</strong> regarding your case.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case:</strong> ${data.caseNumber} - ${data.caseTitle}</p>
          <p style="margin: 8px 0 0;"><strong>Message Preview:</strong></p>
          <p style="margin: 8px 0 0; color: #4a5568; font-style: italic;">"${data.messagePreview}..."</p>
        </div>
        <p>Log in to your portal to view and respond:</p>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Message</a>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  documentUploaded: (data: { recipientName: string; uploaderName: string; caseNumber: string; caseTitle: string; documentName: string; portalUrl: string }) => ({
    subject: `New Document Uploaded: ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">New Document Uploaded</h2>
        <p>Hello ${data.recipientName},</p>
        <p>A new document has been uploaded by <strong>${data.uploaderName}</strong>.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case:</strong> ${data.caseNumber} - ${data.caseTitle}</p>
          <p style="margin: 8px 0 0;"><strong>Document:</strong> ${data.documentName}</p>
        </div>
        <p>Log in to your portal to view the document:</p>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Document</a>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  lawyerAssigned: (data: { clientName: string; lawyerName: string; caseNumber: string; caseTitle: string; portalUrl: string }) => ({
    subject: `Lawyer Assigned to Your Case: ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Lawyer Assigned</h2>
        <p>Hello ${data.clientName},</p>
        <p>Good news! A lawyer has been assigned to your case.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p style="margin: 8px 0 0;"><strong>Title:</strong> ${data.caseTitle}</p>
          <p style="margin: 8px 0 0;"><strong>Assigned Lawyer:</strong> ${data.lawyerName}</p>
        </div>
        <p>Your lawyer will review your case and reach out to you soon. You can also send them a message through your portal.</p>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Case</a>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  caseAssignedToLawyer: (data: { lawyerName: string; clientName: string; caseNumber: string; caseTitle: string; caseType: string; portalUrl: string }) => ({
    subject: `New Case Assigned: ${data.caseNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">New Case Assignment</h2>
        <p>Hello ${data.lawyerName},</p>
        <p>A new case has been assigned to you.</p>
        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p style="margin: 8px 0 0;"><strong>Title:</strong> ${data.caseTitle}</p>
          <p style="margin: 8px 0 0;"><strong>Type:</strong> ${data.caseType}</p>
          <p style="margin: 8px 0 0;"><strong>Client:</strong> ${data.clientName}</p>
        </div>
        <p>Please review the case details and reach out to the client as needed.</p>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Case</a>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  welcomeClient: (data: { clientName: string; portalUrl: string }) => ({
    subject: `Welcome to ${config.resend.fromName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Welcome!</h2>
        <p>Hello ${data.clientName},</p>
        <p>Thank you for registering with us. Your account has been successfully created.</p>
        <p>Through your client portal, you can:</p>
        <ul>
          <li>Submit new cases</li>
          <li>Track case progress</li>
          <li>Upload and view documents</li>
          <li>Communicate with your assigned lawyer</li>
        </ul>
        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Go to Portal</a>
        <p>If you have any questions, please don't hesitate to reach out.</p>
        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  weeklySummary: (data: {
    lawyerName: string;
    stats: { totalCases: number; activeCases: number; newCasesThisWeek: number; closedCasesThisWeek: number; casesNeedingAttention: number };
    attentionCases: Array<{ caseNumber: string; title: string; clientName: string; daysSinceActivity: number }>;
    activeCases: Array<{ caseNumber: string; title: string; status: string; clientName: string }>;
    portalUrl: string;
  }) => ({
    subject: `Weekly Case Summary - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Weekly Case Summary</h2>
        <p>Hello ${data.lawyerName},</p>
        <p>Here's your weekly case summary:</p>

        <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3 style="margin: 0 0 12px 0; color: #2d3748;">Overview</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0;"><strong>Total Cases:</strong></td>
              <td style="text-align: right;">${data.stats.totalCases}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Active Cases:</strong></td>
              <td style="text-align: right;">${data.stats.activeCases}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>New This Week:</strong></td>
              <td style="text-align: right; color: #38a169;">${data.stats.newCasesThisWeek}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Closed This Week:</strong></td>
              <td style="text-align: right; color: #3182ce;">${data.stats.closedCasesThisWeek}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Needing Attention:</strong></td>
              <td style="text-align: right; color: ${data.stats.casesNeedingAttention > 0 ? '#e53e3e' : '#38a169'};">${data.stats.casesNeedingAttention}</td>
            </tr>
          </table>
        </div>

        ${data.attentionCases.length > 0 ? `
        <div style="background: #fff5f5; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #e53e3e;">
          <h3 style="margin: 0 0 12px 0; color: #c53030;">Cases Needing Attention</h3>
          <p style="margin: 0 0 12px 0; color: #742a2a; font-size: 14px;">These cases have had no activity for more than 7 days:</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #feb2b2;">
              <th style="text-align: left; padding: 8px 4px;">Case</th>
              <th style="text-align: left; padding: 8px 4px;">Client</th>
              <th style="text-align: right; padding: 8px 4px;">Days Inactive</th>
            </tr>
            ${data.attentionCases.map(c => `
            <tr style="border-bottom: 1px solid #fed7d7;">
              <td style="padding: 8px 4px;">${c.caseNumber}</td>
              <td style="padding: 8px 4px;">${c.clientName}</td>
              <td style="text-align: right; padding: 8px 4px; color: #e53e3e; font-weight: bold;">${c.daysSinceActivity}</td>
            </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        ${data.activeCases.length > 0 ? `
        <div style="background: #f0fff4; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #38a169;">
          <h3 style="margin: 0 0 12px 0; color: #276749;">Active Cases</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #9ae6b4;">
              <th style="text-align: left; padding: 8px 4px;">Case</th>
              <th style="text-align: left; padding: 8px 4px;">Client</th>
              <th style="text-align: left; padding: 8px 4px;">Status</th>
            </tr>
            ${data.activeCases.map(c => `
            <tr style="border-bottom: 1px solid #c6f6d5;">
              <td style="padding: 8px 4px;">${c.caseNumber}</td>
              <td style="padding: 8px 4px;">${c.clientName}</td>
              <td style="padding: 8px 4px;">${c.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
            </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">View All Cases</a>

        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),

  inactivityReminder: (data: {
    clientName: string;
    caseNumber: string;
    caseTitle: string;
    daysSinceActivity: number;
    lawyerName: string | null;
    portalUrl: string;
  }) => ({
    subject: `Action Needed: Your Case ${data.caseNumber} Requires Attention`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Case Update Needed</h2>
        <p>Hello ${data.clientName},</p>
        <p>We noticed that your case has had no activity for <strong>${data.daysSinceActivity} days</strong>.</p>

        <div style="background: #fffaf0; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dd6b20;">
          <p style="margin: 0;"><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p style="margin: 8px 0 0;"><strong>Title:</strong> ${data.caseTitle}</p>
          ${data.lawyerName ? `<p style="margin: 8px 0 0;"><strong>Your Attorney:</strong> ${data.lawyerName}</p>` : ''}
        </div>

        <p>To keep your case moving forward, we recommend:</p>
        <ul>
          <li>Log in to your portal to review your case status</li>
          <li>Upload any pending documents</li>
          <li>Send a message to your attorney if you have questions</li>
        </ul>

        <a href="${data.portalUrl}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Review Your Case</a>

        <p style="color: #718096; font-size: 14px;">If you've already taken action or have questions, please disregard this reminder or contact your attorney directly.</p>

        <p style="margin-top: 24px;">Best regards,<br/>${config.resend.fromName}</p>
      </div>
    `,
  }),
};

// Format status for display
function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const emailNotificationService = {
  /**
   * Send a raw email with retry logic
   */
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!config.resend.apiKey) {
      logger.warn('Resend API key not configured, skipping email');
      return false;
    }

    let lastError: any = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const { error } = await resend.emails.send({
          from: `${config.resend.fromName} <${config.resend.fromEmail}>`,
          to,
          subject,
          html,
        });

        if (error) {
          lastError = error;
          // Check if error is retryable (rate limits, server errors)
          const isRetryable = this.isRetryableError(error);
          if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
            logger.error(`Failed to send email after ${attempt + 1} attempts:`, error);
            return false;
          }
          const retryDelay = getRetryDelay(attempt);
          logger.warn(`Email send failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${retryDelay}ms...`);
          await delay(retryDelay);
          continue;
        }

        if (attempt > 0) {
          logger.info(`Email sent successfully after ${attempt + 1} attempts to ${to}: ${subject}`);
        } else {
          logger.info(`Email sent to ${to}: ${subject}`);
        }
        return true;
      } catch (err) {
        lastError = err;
        if (attempt === RETRY_CONFIG.maxRetries) {
          logger.error(`Error sending email after ${attempt + 1} attempts:`, err);
          return false;
        }
        const retryDelay = getRetryDelay(attempt);
        logger.warn(`Email send error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
      }
    }

    logger.error('Failed to send email after all retries:', lastError);
    return false;
  },

  /**
   * Check if an error is retryable
   */
  isRetryableError(error: any): boolean {
    // Retry on rate limits (429) and server errors (5xx)
    if (error?.statusCode) {
      return error.statusCode === 429 || error.statusCode >= 500;
    }
    // Retry on network errors
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
      return true;
    }
    return false;
  },

  /**
   * Notify client when their case is submitted
   */
  async notifyCaseSubmitted(clientEmail: string, clientName: string, caseNumber: string, caseTitle: string): Promise<boolean> {
    const template = templates.caseSubmitted({ clientName, caseNumber, caseTitle });
    return this.sendEmail(clientEmail, template.subject, template.html);
  },

  /**
   * Notify client when case status changes
   */
  async notifyCaseStatusChanged(
    clientEmail: string,
    clientName: string,
    caseNumber: string,
    caseTitle: string,
    oldStatus: string,
    newStatus: string,
    caseId: string
  ): Promise<boolean> {
    const template = templates.caseStatusChanged({
      clientName,
      caseNumber,
      caseTitle,
      oldStatus: formatStatus(oldStatus),
      newStatus: formatStatus(newStatus),
      portalUrl: `${config.frontendUrl}/portal/cases/${caseId}`,
    });
    return this.sendEmail(clientEmail, template.subject, template.html);
  },

  /**
   * Notify user when they receive a new message
   */
  async notifyNewMessage(
    recipientEmail: string,
    recipientName: string,
    senderName: string,
    caseNumber: string,
    caseTitle: string,
    messageContent: string,
    caseId: string,
    isClient: boolean
  ): Promise<boolean> {
    const portalPath = isClient ? 'portal' : 'lawyer';
    const template = templates.newMessage({
      recipientName,
      senderName,
      caseNumber,
      caseTitle,
      messagePreview: messageContent.substring(0, 100),
      portalUrl: `${config.frontendUrl}/${portalPath}/cases/${caseId}`,
    });
    return this.sendEmail(recipientEmail, template.subject, template.html);
  },

  /**
   * Notify when a document is uploaded
   */
  async notifyDocumentUploaded(
    recipientEmail: string,
    recipientName: string,
    uploaderName: string,
    caseNumber: string,
    caseTitle: string,
    documentName: string,
    caseId: string,
    isClient: boolean
  ): Promise<boolean> {
    const portalPath = isClient ? 'portal' : 'lawyer';
    const template = templates.documentUploaded({
      recipientName,
      uploaderName,
      caseNumber,
      caseTitle,
      documentName,
      portalUrl: `${config.frontendUrl}/${portalPath}/cases/${caseId}`,
    });
    return this.sendEmail(recipientEmail, template.subject, template.html);
  },

  /**
   * Notify client when a lawyer is assigned to their case
   */
  async notifyLawyerAssigned(
    clientEmail: string,
    clientName: string,
    lawyerName: string,
    caseNumber: string,
    caseTitle: string,
    caseId: string
  ): Promise<boolean> {
    const template = templates.lawyerAssigned({
      clientName,
      lawyerName,
      caseNumber,
      caseTitle,
      portalUrl: `${config.frontendUrl}/portal/cases/${caseId}`,
    });
    return this.sendEmail(clientEmail, template.subject, template.html);
  },

  /**
   * Notify lawyer when a case is assigned to them
   */
  async notifyCaseAssignedToLawyer(
    lawyerEmail: string,
    lawyerName: string,
    clientName: string,
    caseNumber: string,
    caseTitle: string,
    caseType: string,
    caseId: string
  ): Promise<boolean> {
    const template = templates.caseAssignedToLawyer({
      lawyerName,
      clientName,
      caseNumber,
      caseTitle,
      caseType: formatStatus(caseType || 'General'),
      portalUrl: `${config.frontendUrl}/lawyer/cases/${caseId}`,
    });
    return this.sendEmail(lawyerEmail, template.subject, template.html);
  },

  /**
   * Send welcome email to new client
   */
  async sendWelcomeEmail(clientEmail: string, clientName: string): Promise<boolean> {
    const template = templates.welcomeClient({
      clientName,
      portalUrl: `${config.frontendUrl}/portal`,
    });
    return this.sendEmail(clientEmail, template.subject, template.html);
  },

  /**
   * Send weekly summary email to lawyer
   */
  async sendWeeklySummary(
    lawyerEmail: string,
    lawyerName: string,
    stats: {
      totalCases: number;
      activeCases: number;
      newCasesThisWeek: number;
      closedCasesThisWeek: number;
      casesNeedingAttention: number;
    },
    attentionCases: Array<{
      caseNumber: string;
      title: string;
      clientName: string;
      daysSinceActivity: number;
    }>,
    activeCases: Array<{
      caseNumber: string;
      title: string;
      status: string;
      clientName: string;
    }>
  ): Promise<boolean> {
    const template = templates.weeklySummary({
      lawyerName,
      stats,
      attentionCases,
      activeCases,
      portalUrl: `${config.frontendUrl}/lawyer/cases`,
    });
    return this.sendEmail(lawyerEmail, template.subject, template.html);
  },

  /**
   * Send inactivity reminder email to client
   */
  async sendInactivityReminder(
    clientEmail: string,
    clientName: string,
    caseNumber: string,
    caseTitle: string,
    daysSinceActivity: number,
    lawyerName: string | null,
    caseId: string
  ): Promise<boolean> {
    const template = templates.inactivityReminder({
      clientName,
      caseNumber,
      caseTitle,
      daysSinceActivity,
      lawyerName,
      portalUrl: `${config.frontendUrl}/portal/cases/${caseId}`,
    });
    return this.sendEmail(clientEmail, template.subject, template.html);
  },
};
