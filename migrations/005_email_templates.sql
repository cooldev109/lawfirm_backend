-- Migration: Create email_templates table for customizable email templates
-- This allows admins to customize email content without code changes

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  subject VARCHAR(255) NOT NULL,
  html_content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default templates
INSERT INTO email_templates (template_key, name, description, subject, html_content, variables) VALUES
(
  'case_submitted',
  'Case Submitted',
  'Sent to clients when they submit a new case',
  'New Case Submitted: {{caseNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
</div>',
  '["clientName", "caseNumber", "caseTitle", "firmName"]'::jsonb
),
(
  'case_status_changed',
  'Case Status Changed',
  'Sent to clients when their case status is updated',
  'Case Status Update: {{caseNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
</div>',
  '["clientName", "caseNumber", "caseTitle", "oldStatus", "newStatus", "portalUrl", "firmName"]'::jsonb
),
(
  'new_message',
  'New Message',
  'Sent when a user receives a new message on a case',
  'New Message on Case {{caseNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
</div>',
  '["recipientName", "senderName", "caseNumber", "caseTitle", "messagePreview", "portalUrl", "firmName"]'::jsonb
),
(
  'document_uploaded',
  'Document Uploaded',
  'Sent when a new document is uploaded to a case',
  'New Document Uploaded: {{caseNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
</div>',
  '["recipientName", "uploaderName", "caseNumber", "caseTitle", "documentName", "portalUrl", "firmName"]'::jsonb
),
(
  'lawyer_assigned',
  'Lawyer Assigned',
  'Sent to clients when a lawyer is assigned to their case',
  'Lawyer Assigned to Your Case: {{caseNumber}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
</div>',
  '["clientName", "lawyerName", "caseNumber", "caseTitle", "portalUrl", "firmName"]'::jsonb
),
(
  'welcome_client',
  'Welcome Email',
  'Sent to new clients upon registration',
  'Welcome to {{firmName}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
  <p>If you have any questions, please don''t hesitate to reach out.</p>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>',
  '["clientName", "portalUrl", "firmName"]'::jsonb
),
(
  'inactivity_reminder',
  'Inactivity Reminder',
  'Sent to clients when their case has been inactive for too long',
  'Action Needed: Your Case {{caseNumber}} Requires Attention',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
  <p style="color: #718096; font-size: 14px;">If you''ve already taken action or have questions, please disregard this reminder or contact your attorney directly.</p>
  <p style="margin-top: 24px;">Best regards,<br/>{{firmName}}</p>
</div>',
  '["clientName", "caseNumber", "caseTitle", "daysSinceActivity", "lawyerName", "portalUrl", "firmName"]'::jsonb
)
ON CONFLICT (template_key) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

-- Add comment for documentation
COMMENT ON TABLE email_templates IS 'Customizable email templates for system notifications';
COMMENT ON COLUMN email_templates.template_key IS 'Unique identifier used in code to reference this template';
COMMENT ON COLUMN email_templates.variables IS 'JSON array of available template variables';
