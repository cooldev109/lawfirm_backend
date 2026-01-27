import bcrypt from 'bcryptjs';
import { pool, query } from '../config/database';
import { logger } from '../utils/logger';
import { UserRole } from '../types';

const SALT_ROUNDS = 10;

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');

    // Create admin user
    const adminPasswordHash = await bcrypt.hash('admin123', SALT_ROUNDS);
    const adminResult = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      ['admin@lawfirm.com', adminPasswordHash, UserRole.ADMIN, 'System', 'Admin']
    );
    if (adminResult.length > 0) {
      logger.info('Created admin user: admin@lawfirm.com');
    }

    // Create sample lawyer
    const lawyerPasswordHash = await bcrypt.hash('lawyer123', SALT_ROUNDS);
    const lawyerUserResult = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      ['john.smith@lawfirm.com', lawyerPasswordHash, UserRole.LAWYER, 'John', 'Smith', '+1-555-0101']
    );
    if (lawyerUserResult.length > 0) {
      await query(
        `INSERT INTO lawyers (user_id, bar_number, specialization, is_available, max_cases)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING`,
        [lawyerUserResult[0].id, 'BAR-12345', 'Civil Litigation', true, 30]
      );
      logger.info('Created lawyer user: john.smith@lawfirm.com');
    }

    // Create second lawyer
    const lawyer2PasswordHash = await bcrypt.hash('lawyer123', SALT_ROUNDS);
    const lawyer2UserResult = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      ['maria.garcia@lawfirm.com', lawyer2PasswordHash, UserRole.LAWYER, 'Maria', 'Garcia', '+1-555-0102']
    );
    if (lawyer2UserResult.length > 0) {
      await query(
        `INSERT INTO lawyers (user_id, bar_number, specialization, is_available, max_cases)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING`,
        [lawyer2UserResult[0].id, 'BAR-67890', 'Corporate Law', true, 25]
      );
      logger.info('Created lawyer user: maria.garcia@lawfirm.com');
    }

    // Create sample client
    const clientPasswordHash = await bcrypt.hash('client123', SALT_ROUNDS);
    const clientUserResult = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      ['demo.client@example.com', clientPasswordHash, UserRole.CLIENT, 'Demo', 'Client', '+1-555-0200']
    );
    if (clientUserResult.length > 0) {
      await query(
        `INSERT INTO clients (user_id, company_name, address, city, state, zip_code, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO NOTHING`,
        [clientUserResult[0].id, 'Demo Company LLC', '123 Main Street', 'New York', 'NY', '10001', 'USA']
      );
      logger.info('Created client user: demo.client@example.com');
    }

    // Create email templates
    const templates = [
      {
        name: 'case_created',
        subject: 'Your Case Has Been Created - {{case_number}}',
        body_text: `Dear {{client_name}},

Thank you for contacting our law firm. We have received your inquiry and created a case file for you.

Case Number: {{case_number}}
Case Title: {{case_title}}

A member of our legal team will review your case and contact you shortly.

You can track your case status through our client portal.

Best regards,
{{firm_name}}`,
        variables: ['client_name', 'case_number', 'case_title', 'firm_name'],
      },
      {
        name: 'lawyer_assigned',
        subject: 'Attorney Assigned to Your Case - {{case_number}}',
        body_text: `Dear {{client_name}},

We are pleased to inform you that an attorney has been assigned to your case.

Case Number: {{case_number}}
Assigned Attorney: {{lawyer_name}}

{{lawyer_name}} will be reviewing your case and will contact you soon to discuss the next steps.

Best regards,
{{firm_name}}`,
        variables: ['client_name', 'case_number', 'lawyer_name', 'firm_name'],
      },
      {
        name: 'document_received',
        subject: 'Document Received - Case {{case_number}}',
        body_text: `Dear {{client_name}},

We have received and archived your document for case {{case_number}}.

Document: {{document_name}}
Received: {{received_date}}

Thank you for your submission.

Best regards,
{{firm_name}}`,
        variables: ['client_name', 'case_number', 'document_name', 'received_date', 'firm_name'],
      },
      {
        name: 'status_update',
        subject: 'Case Status Update - {{case_number}}',
        body_text: `Dear {{client_name}},

There has been an update to your case.

Case Number: {{case_number}}
New Status: {{new_status}}
{{#if notes}}
Notes: {{notes}}
{{/if}}

If you have any questions, please don't hesitate to contact us.

Best regards,
{{firm_name}}`,
        variables: ['client_name', 'case_number', 'new_status', 'notes', 'firm_name'],
      },
      {
        name: 'inactivity_notice',
        subject: 'Action Required - Case {{case_number}}',
        body_text: `Dear {{client_name}},

We noticed that there has been no activity on your case for {{days_inactive}} days.

Case Number: {{case_number}}
Case Title: {{case_title}}

Please contact us if you would like to continue with your case or provide any updates.

Best regards,
{{firm_name}}`,
        variables: ['client_name', 'case_number', 'case_title', 'days_inactive', 'firm_name'],
      },
      {
        name: 'lawyer_notification',
        subject: 'New Case Assigned - {{case_number}}',
        body_text: `Dear {{lawyer_name}},

A new case has been assigned to you.

Case Number: {{case_number}}
Case Title: {{case_title}}
Client: {{client_name}}
Client Email: {{client_email}}

Priority: {{priority}}

Please review the case details in the system.

Best regards,
Case Management System`,
        variables: ['lawyer_name', 'case_number', 'case_title', 'client_name', 'client_email', 'priority'],
      },
    ];

    for (const template of templates) {
      await query(
        `INSERT INTO email_templates (name, subject, body_text, variables)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET
           subject = EXCLUDED.subject,
           body_text = EXCLUDED.body_text,
           variables = EXCLUDED.variables`,
        [template.name, template.subject, template.body_text, template.variables]
      );
    }
    logger.info(`Created/updated ${templates.length} email templates`);

    logger.info('Database seeding completed successfully!');

  } catch (error) {
    logger.error('Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Seeding failed:', error);
    process.exit(1);
  });
