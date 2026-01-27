import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

export interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  subject?: string;
  html_content?: string;
  is_active?: boolean;
}

export const emailTemplateService = {
  /**
   * Get all email templates
   */
  async getAllTemplates(): Promise<EmailTemplate[]> {
    const rows = await query(
      `SELECT id, template_key, name, description, subject, html_content, variables, is_active, created_at, updated_at
       FROM email_templates
       ORDER BY name ASC`
    );
    return rows;
  },

  /**
   * Get a template by its key
   */
  async getTemplateByKey(templateKey: string): Promise<EmailTemplate | null> {
    const rows = await query(
      `SELECT id, template_key, name, description, subject, html_content, variables, is_active, created_at, updated_at
       FROM email_templates
       WHERE template_key = $1`,
      [templateKey]
    );
    return rows[0] || null;
  },

  /**
   * Get a template by ID
   */
  async getTemplateById(id: string): Promise<EmailTemplate | null> {
    const rows = await query(
      `SELECT id, template_key, name, description, subject, html_content, variables, is_active, created_at, updated_at
       FROM email_templates
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Update a template
   */
  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<EmailTemplate> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new NotFoundError('Email template not found');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      values.push(input.subject);
    }
    if (input.html_content !== undefined) {
      updates.push(`html_content = $${paramIndex++}`);
      values.push(input.html_content);
    }
    if (input.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.is_active);
    }

    if (updates.length === 0) {
      return template;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const rows = await query(
      `UPDATE email_templates
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, template_key, name, description, subject, html_content, variables, is_active, created_at, updated_at`,
      values
    );

    logger.info(`Email template updated: ${template.template_key}`);
    return rows[0];
  },

  /**
   * Reset a template to its default content
   */
  async resetTemplate(id: string): Promise<EmailTemplate> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new NotFoundError('Email template not found');
    }

    const defaults = this.getDefaultTemplate(template.template_key);
    if (!defaults) {
      throw new NotFoundError('Default template not found for this template key');
    }

    const rows = await query(
      `UPDATE email_templates
       SET subject = $1, html_content = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, template_key, name, description, subject, html_content, variables, is_active, created_at, updated_at`,
      [defaults.subject, defaults.html_content, id]
    );

    logger.info(`Email template reset to default: ${template.template_key}`);
    return rows[0];
  },

  /**
   * Get default template content by key
   */
  getDefaultTemplate(templateKey: string): { subject: string; html_content: string } | null {
    const defaults: Record<string, { subject: string; html_content: string }> = {
      case_submitted: {
        subject: 'New Case Submitted: {{caseNumber}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">New Case Submitted</h2>
  <p>Hello {{clientName}},</p>
  <p>Your case has been successfully submitted to our system.</p>
  <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Case Number:</strong> {{caseNumber}}</p>
    <p style="margin: 8px 0 0;"><strong>Title:</strong> {{caseTitle}}</p>
  </div>
  <p>Our team will review your case and get back to you shortly.</p>
  <p>You can track your case status by logging into your client portal.</p>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      case_status_changed: {
        subject: 'Case Status Update: {{caseNumber}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">Case Status Update</h2>
  <p>Hello {{clientName}},</p>
  <p>The status of your case has been updated.</p>
  <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Case Number:</strong> {{caseNumber}}</p>
    <p style="margin: 8px 0 0;"><strong>Title:</strong> {{caseTitle}}</p>
    <p style="margin: 8px 0 0;"><strong>Previous Status:</strong> {{oldStatus}}</p>
    <p style="margin: 8px 0 0;"><strong>New Status:</strong> <span style="color: #2b6cb0; font-weight: bold;">{{newStatus}}</span></p>
  </div>
  <p>Log in to your portal to view more details:</p>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Case</a>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      new_message: {
        subject: 'New Message on Case {{caseNumber}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">New Message Received</h2>
  <p>Hello {{recipientName}},</p>
  <p>You have received a new message from <strong>{{senderName}}</strong> regarding your case.</p>
  <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Case:</strong> {{caseNumber}} - {{caseTitle}}</p>
    <p style="margin: 8px 0 0;"><strong>Message Preview:</strong></p>
    <p style="margin: 8px 0 0; color: #4a5568; font-style: italic;">"{{messagePreview}}..."</p>
  </div>
  <p>Log in to your portal to view and respond:</p>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Message</a>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      document_uploaded: {
        subject: 'New Document Uploaded: {{caseNumber}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">New Document Uploaded</h2>
  <p>Hello {{recipientName}},</p>
  <p>A new document has been uploaded by <strong>{{uploaderName}}</strong>.</p>
  <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Case:</strong> {{caseNumber}} - {{caseTitle}}</p>
    <p style="margin: 8px 0 0;"><strong>Document:</strong> {{documentName}}</p>
  </div>
  <p>Log in to your portal to view the document:</p>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Document</a>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      lawyer_assigned: {
        subject: 'Lawyer Assigned to Your Case: {{caseNumber}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">Lawyer Assigned</h2>
  <p>Hello {{clientName}},</p>
  <p>Good news! A lawyer has been assigned to your case.</p>
  <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Case Number:</strong> {{caseNumber}}</p>
    <p style="margin: 8px 0 0;"><strong>Title:</strong> {{caseTitle}}</p>
    <p style="margin: 8px 0 0;"><strong>Assigned Lawyer:</strong> {{lawyerName}}</p>
  </div>
  <p>Your lawyer will review your case and reach out to you soon. You can also send them a message through your portal.</p>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 8px 0;">View Case</a>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      welcome_client: {
        subject: 'Welcome to {{firmName}}',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">Welcome!</h2>
  <p>Hello {{clientName}},</p>
  <p>Thank you for registering with us. Your account has been successfully created.</p>
  <p>Through your client portal, you can:</p>
  <ul>
    <li>Submit new cases</li>
    <li>Track case progress</li>
    <li>Upload and view documents</li>
    <li>Communicate with your assigned lawyer</li>
  </ul>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Go to Portal</a>
  <p>If you have any questions, please don't hesitate to reach out.</p>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
      inactivity_reminder: {
        subject: 'Action Needed: Your Case {{caseNumber}} Requires Attention',
        html_content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a365d;">Case Update Needed</h2>
  <p>Hello {{clientName}},</p>
  <p>We noticed that your case has had no activity for <strong>{{daysSinceActivity}} days</strong>.</p>
  <div style="background: #fffaf0; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dd6b20;">
    <p style="margin: 0;"><strong>Case Number:</strong> {{caseNumber}}</p>
    <p style="margin: 8px 0 0;"><strong>Title:</strong> {{caseTitle}}</p>
    {{#if lawyerName}}<p style="margin: 8px 0 0;"><strong>Your Attorney:</strong> {{lawyerName}}</p>{{/if}}
  </div>
  <p>To keep your case moving forward, we recommend:</p>
  <ul>
    <li>Log in to your portal to review your case status</li>
    <li>Upload any pending documents</li>
    <li>Send a message to your attorney if you have questions</li>
  </ul>
  <a href="{{portalUrl}}" style="display: inline-block; background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Review Your Case</a>
  <p style="color: #718096; font-size: 14px;">If you've already taken action or have questions, please disregard this reminder or contact your attorney directly.</p>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>`,
      },
    };

    return defaults[templateKey] || null;
  },

  /**
   * Render a template with variables
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      // Replace {{variable}} with value
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, value || '');
    }
    // Handle conditional blocks {{#if variable}}...{{/if}}
    rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, content) => {
      return variables[varName] ? content : '';
    });
    return rendered;
  },

  /**
   * Preview a template with sample data
   */
  async previewTemplate(id: string, sampleData?: Record<string, string>): Promise<{ subject: string; html: string }> {
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new NotFoundError('Email template not found');
    }

    // Generate sample data if not provided
    const data = sampleData || this.getSampleData(template.template_key);

    return {
      subject: this.renderTemplate(template.subject, data),
      html: this.renderTemplate(template.html_content, data),
    };
  },

  /**
   * Get sample data for a template preview
   */
  getSampleData(templateKey: string): Record<string, string> {
    const commonData = {
      firmName: 'Law Firm Case Management',
      portalUrl: 'https://portal.example.com',
    };

    const sampleData: Record<string, Record<string, string>> = {
      case_submitted: {
        ...commonData,
        clientName: 'John Smith',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
      },
      case_status_changed: {
        ...commonData,
        clientName: 'John Smith',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
        oldStatus: 'New',
        newStatus: 'In Review',
      },
      new_message: {
        ...commonData,
        recipientName: 'John Smith',
        senderName: 'Jane Attorney',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
        messagePreview: 'I have reviewed your case documents and have some questions',
      },
      document_uploaded: {
        ...commonData,
        recipientName: 'John Smith',
        uploaderName: 'Jane Attorney',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
        documentName: 'Medical_Records.pdf',
      },
      lawyer_assigned: {
        ...commonData,
        clientName: 'John Smith',
        lawyerName: 'Jane Attorney',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
      },
      welcome_client: {
        ...commonData,
        clientName: 'John Smith',
      },
      inactivity_reminder: {
        ...commonData,
        clientName: 'John Smith',
        caseNumber: '2025-PI-0001',
        caseTitle: 'Personal Injury - John Smith',
        daysSinceActivity: '21',
        lawyerName: 'Jane Attorney',
      },
    };

    return sampleData[templateKey] || commonData;
  },
};
