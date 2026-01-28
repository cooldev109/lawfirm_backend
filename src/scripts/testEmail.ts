/**
 * Email Test Script
 * Run with: npx ts-node src/scripts/testEmail.ts
 */

import { config } from '../config/env';

// Check if Resend is configured
console.log('=== Email Configuration Check ===\n');
console.log('RESEND_API_KEY:', config.resend.apiKey ? `${config.resend.apiKey.substring(0, 10)}...` : 'NOT SET');
console.log('RESEND_FROM_EMAIL:', config.resend.fromEmail);
console.log('RESEND_FROM_NAME:', config.resend.fromName);
console.log('FRONTEND_URL:', config.frontendUrl);
console.log('\n');

// Import Resend after config check
import { Resend } from 'resend';

async function testEmail() {
  if (!config.resend.apiKey) {
    console.error('ERROR: RESEND_API_KEY is not configured in .env');
    process.exit(1);
  }

  const resend = new Resend(config.resend.apiKey);

  // Test email recipient - CHANGE THIS to your email
  const testRecipient = 'williamstevencli@gmail.com';

  console.log(`Sending test email to: ${testRecipient}`);
  console.log(`From: ${config.resend.fromName} <${config.resend.fromEmail}>`);
  console.log('\n');

  try {
    const { data, error } = await resend.emails.send({
      from: `${config.resend.fromName} <${config.resend.fromEmail}>`,
      to: testRecipient,
      subject: 'Test Email from Lawyer System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a365d;">Email Test Successful!</h2>
          <p>If you're reading this, your Resend email configuration is working correctly.</p>
          <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>From:</strong> ${config.resend.fromEmail}</p>
            <p style="margin: 8px 0 0;"><strong>Sender Name:</strong> ${config.resend.fromName}</p>
            <p style="margin: 8px 0 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          <p style="color: #718096; font-size: 14px;">This is a test email from the Lawyer Case Management System.</p>
        </div>
      `,
    });

    if (error) {
      console.error('ERROR sending email:', error);
      process.exit(1);
    }

    console.log('SUCCESS! Email sent.');
    console.log('Email ID:', data?.id);
    console.log('\nCheck your inbox at:', testRecipient);
  } catch (err) {
    console.error('EXCEPTION:', err);
    process.exit(1);
  }
}

testEmail();
