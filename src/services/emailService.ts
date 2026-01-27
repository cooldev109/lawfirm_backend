import nodemailer from 'nodemailer';
import { query } from '../config/database';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_text: string;
  body_html: string;
}

// Create transporter (configure based on environment)
const createTransporter = () => {
  if (!config.smtp.user || !config.smtp.password) {
    logger.warn('SMTP not configured - emails will be logged only');
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password,
    },
  });
};

let transporter = createTransporter();

export const emailService = {
  async verifyConnection(): Promise<boolean> {
    if (!transporter) {
      return false;
    }
    try {
      await transporter.verify();
      logger.info('SMTP connection verified successfully');
      return true;
    } catch (error) {
      logger.error('SMTP connection verification failed:', error);
      return false;
    }
  },

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!transporter) {
      // Log email for development when SMTP is not configured
      logger.info('Email (not sent - SMTP not configured):', {
        to: toAddresses,
        subject: options.subject,
        text: options.text?.substring(0, 200),
      });
      return { success: true, error: 'SMTP not configured - email logged only' };
    }

    try {
      const info = await transporter.sendMail({
        from: `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`,
        to: toAddresses,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });

      logger.info(`Email sent to ${toAddresses}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to send email to ${toAddresses}:`, error);
      return { success: false, error: errorMessage };
    }
  },

  async getTemplate(templateName: string): Promise<EmailTemplate | null> {
    const rows = await query(
      'SELECT * FROM email_templates WHERE name = $1 AND is_active = true',
      [templateName]
    );
    return rows[0] || null;
  },

  async sendTemplatedEmail(
    templateName: string,
    to: string,
    variables: Record<string, string>
  ): Promise<boolean> {
    const template = await this.getTemplate(templateName);
    if (!template) {
      logger.error(`Email template not found: ${templateName}`);
      return false;
    }

    // Replace variables in template
    let subject = template.subject;
    let bodyText = template.body_text;
    let bodyHtml = template.body_html;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      bodyText = bodyText.replace(new RegExp(placeholder, 'g'), value);
      bodyHtml = bodyHtml.replace(new RegExp(placeholder, 'g'), value);
    }

    const result = await this.sendEmail({
      to,
      subject,
      text: bodyText,
      html: bodyHtml,
    });
    return result.success;
  },

  // Specific notification methods
  async sendWelcomeEmail(
    email: string,
    firstName: string,
    caseNumber: string
  ): Promise<EmailResult> {
    // Try template first, fall back to inline template
    const template = await this.getTemplate('intake_confirmation');
    if (template) {
      const result = await this.sendTemplatedEmail('intake_confirmation', email, {
        first_name: firstName,
        case_number: caseNumber,
        login_url: `${config.frontendUrl}/login`,
        portal_url: `${config.frontendUrl}/portal`,
      });
      return { success: result };
    }

    // Fallback inline template
    const subject = `Welcome to ${config.smtp.fromName} - Case ${caseNumber}`;
    const html = this.getWelcomeEmailHtml(firstName, caseNumber);
    const text = this.getWelcomeEmailText(firstName, caseNumber);

    return this.sendEmail({ to: email, subject, html, text });
  },

  getWelcomeEmailHtml(firstName: string, caseNumber: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a365d; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; background-color: #f9fafb; }
          .case-number { font-size: 24px; font-weight: bold; color: #1a365d; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1a365d; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${config.smtp.fromName}</h1>
          </div>
          <div class="content">
            <h2>Welcome, ${firstName}!</h2>
            <p>Thank you for submitting your case. We have received your information and our team will review it promptly.</p>
            <p>Your case number is:</p>
            <div class="case-number">${caseNumber}</div>
            <p>Please save this number for your records. You can use it to track the progress of your case.</p>
            <p>You can access your client portal to:</p>
            <ul>
              <li>View case status and updates</li>
              <li>Upload additional documents</li>
              <li>Communicate with your legal team</li>
            </ul>
            <a href="${config.frontendUrl}/portal" class="button">Access Client Portal</a>
            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from ${config.smtp.fromName}.</p>
            <p>Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  getWelcomeEmailText(firstName: string, caseNumber: string): string {
    return `
Welcome, ${firstName}!

Thank you for submitting your case. We have received your information and our team will review it promptly.

Your case number is: ${caseNumber}

Please save this number for your records. You can use it to track the progress of your case.

Access your client portal at: ${config.frontendUrl}/portal

You can use the portal to:
- View case status and updates
- Upload additional documents
- Communicate with your legal team

If you have any questions, please don't hesitate to contact us.

${config.smtp.fromName}
    `.trim();
  },

  async sendNewCaseNotification(
    adminEmail: string,
    clientName: string,
    caseNumber: string,
    caseType: string,
    description: string
  ): Promise<EmailResult> {
    const subject = `New Case Submitted: ${caseNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">New Case Submission</h2>
        <p>A new case has been submitted and requires review:</p>
        <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb;"><strong>Case Number:</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${caseNumber}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb;"><strong>Client:</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${clientName}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb;"><strong>Case Type:</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${caseType.replace(/_/g, ' ')}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb;"><strong>Description:</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${description.substring(0, 200)}${description.length > 200 ? '...' : ''}</td></tr>
        </table>
        <p><a href="${config.frontendUrl}/admin/cases" style="display: inline-block; padding: 12px 24px; background-color: #1a365d; color: white; text-decoration: none; border-radius: 4px;">Review Case</a></p>
      </div>
    `;
    const text = `New Case Submission\n\nA new case has been submitted and requires review:\n\nCase Number: ${caseNumber}\nClient: ${clientName}\nCase Type: ${caseType.replace(/_/g, ' ')}\nDescription: ${description.substring(0, 200)}\n\nReview at: ${config.frontendUrl}/admin/cases`;

    return this.sendEmail({ to: adminEmail, subject, html, text });
  },

  async sendLawyerNotification(
    lawyerEmail: string,
    lawyerName: string,
    clientName: string,
    caseNumber: string,
    caseType: string
  ): Promise<EmailResult> {
    const subject = `New Case Assigned: ${caseNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Case Assignment</h2>
        <p>Hello ${lawyerName},</p>
        <p>A new case has been assigned to you:</p>
        <table style="margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Case Number:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${caseNumber}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Client:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${clientName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Case Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${caseType}</td></tr>
        </table>
        <p><a href="${config.frontendUrl}/admin/cases" style="color: #1a365d;">View in Dashboard</a></p>
      </div>
    `;
    const text = `New Case Assignment\n\nHello ${lawyerName},\n\nA new case has been assigned to you:\n\nCase Number: ${caseNumber}\nClient: ${clientName}\nCase Type: ${caseType}\n\nView in Dashboard: ${config.frontendUrl}/admin/cases`;

    return this.sendEmail({ to: lawyerEmail, subject, html, text });
  },

  async sendCaseStatusUpdate(
    clientEmail: string,
    clientName: string,
    caseNumber: string,
    newStatus: string,
    message?: string
  ): Promise<EmailResult> {
    const subject = `Case Update - ${caseNumber}`;
    const messageHtml = message ? `<p>${message}</p>` : '';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Case Status Update</h2>
        <p>Hello ${clientName},</p>
        <p>Your case <strong>${caseNumber}</strong> has been updated.</p>
        <p><strong>New Status:</strong> ${newStatus}</p>
        ${messageHtml}
        <p><a href="${config.frontendUrl}/portal" style="display: inline-block; padding: 12px 24px; background-color: #1a365d; color: white; text-decoration: none; border-radius: 4px;">View Case Details</a></p>
      </div>
    `;
    const text = `Case Status Update\n\nHello ${clientName},\n\nYour case ${caseNumber} has been updated.\n\nNew Status: ${newStatus}\n${message || ''}\n\nView details: ${config.frontendUrl}/portal`;

    return this.sendEmail({ to: clientEmail, subject, html, text });
  },

  async sendDocumentNotification(
    recipientEmail: string,
    recipientName: string,
    caseNumber: string,
    documentName: string,
    uploadedBy: string
  ): Promise<EmailResult> {
    const subject = `New Document - Case ${caseNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Document Uploaded</h2>
        <p>Hello ${recipientName},</p>
        <p>A new document has been uploaded to case <strong>${caseNumber}</strong>:</p>
        <p><strong>Document:</strong> ${documentName}</p>
        <p><strong>Uploaded by:</strong> ${uploadedBy}</p>
        <p><a href="${config.frontendUrl}/portal" style="color: #1a365d;">View in Portal</a></p>
      </div>
    `;
    const text = `New Document Uploaded\n\nHello ${recipientName},\n\nA new document has been uploaded to case ${caseNumber}:\n\nDocument: ${documentName}\nUploaded by: ${uploadedBy}\n\nView in Portal: ${config.frontendUrl}/portal`;

    return this.sendEmail({ to: recipientEmail, subject, html, text });
  },

  async sendNewEmailNotification(
    to: string,
    caseNumber: string,
    fromEmail: string,
    emailSubject: string
  ): Promise<EmailResult> {
    const subject = `New Email on Case ${caseNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Email Received</h2>
        <p>A new email has been received for case <strong>${caseNumber}</strong>.</p>
        <table style="margin: 20px 0;">
          <tr><td><strong>From:</strong></td><td>${fromEmail}</td></tr>
          <tr><td><strong>Subject:</strong></td><td>${emailSubject}</td></tr>
        </table>
        <p><a href="${config.frontendUrl}/portal/cases" style="color: #1a365d;">Log in to view the full message</a></p>
      </div>
    `;
    const text = `New Email Received\n\nA new email has been received for case ${caseNumber}.\n\nFrom: ${fromEmail}\nSubject: ${emailSubject}\n\nLog in to view: ${config.frontendUrl}/portal/cases`;

    return this.sendEmail({ to, subject, html, text });
  },

  async sendPasswordReset(
    email: string,
    firstName: string,
    resetToken: string
  ): Promise<EmailResult> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
    const subject = 'Password Reset Request';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hello ${firstName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1a365d; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `;
    const text = `Password Reset\n\nHello ${firstName},\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\nThis link will expire in 1 hour.`;

    return this.sendEmail({ to: email, subject, html, text });
  },

  // Log email to database for auditing
  async logEmail(
    caseId: string | null,
    to: string,
    subject: string,
    status: 'sent' | 'failed',
    _error?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO emails (id, case_id, direction, sender, recipient, subject, status, sent_at, created_at)
         VALUES (gen_random_uuid(), $1, 'outbound', $2, $3, $4, $5, NOW(), NOW())`,
        [caseId, config.smtp.fromAddress, to, subject, status]
      );
    } catch (err) {
      logger.error('Failed to log email:', err);
    }
  },
};
