import Imap from 'imap';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { config } from '../config/env';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { documentService } from './documentService';
import { caseEventRepository } from '../repositories/caseRepository';
import { CaseEventType } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedEmail {
  messageId: string;
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  date: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

export interface EmailProcessResult {
  success: boolean;
  emailId?: string;
  caseId?: string;
  caseNumber?: string;
  error?: string;
}

class ImapService {
  private imap: Imap | null = null;
  private isConnected: boolean = false;
  private isConfigured: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.isConfigured = !!(config.imap.user && config.imap.password);
    if (!this.isConfigured) {
      logger.warn('IMAP credentials not configured. Email receiving is disabled.');
    }
  }

  async connect(): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('IMAP not configured - cannot connect');
      return false;
    }

    return new Promise((resolve) => {
      try {
        this.imap = new Imap({
          user: config.imap.user,
          password: config.imap.password,
          host: config.imap.host,
          port: config.imap.port,
          tls: config.imap.tls,
          tlsOptions: { rejectUnauthorized: false },
        });

        this.imap.once('ready', () => {
          logger.info('IMAP connection established');
          this.isConnected = true;
          resolve(true);
        });

        this.imap.once('error', (err: Error) => {
          logger.error('IMAP connection error:', err);
          this.isConnected = false;
          resolve(false);
        });

        this.imap.once('end', () => {
          logger.info('IMAP connection ended');
          this.isConnected = false;
        });

        this.imap.connect();
      } catch (error) {
        logger.error('Failed to create IMAP connection:', error);
        resolve(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.imap && this.isConnected) {
      this.imap.end();
      this.isConnected = false;
    }
  }

  async fetchUnreadEmails(): Promise<ParsedEmail[]> {
    if (!this.imap || !this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        return [];
      }
    }

    return new Promise((resolve) => {
      const emails: ParsedEmail[] = [];

      this.imap!.openBox('INBOX', false, (err) => {
        if (err) {
          logger.error('Failed to open INBOX:', err);
          resolve([]);
          return;
        }

        this.imap!.search(['UNSEEN'], (searchErr, results) => {
          if (searchErr) {
            logger.error('Failed to search emails:', searchErr);
            resolve([]);
            return;
          }

          if (!results || results.length === 0) {
            logger.debug('No unread emails found');
            resolve([]);
            return;
          }

          logger.info(`Found ${results.length} unread email(s)`);

          const fetch = this.imap!.fetch(results, {
            bodies: '',
            markSeen: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, (parseErr: any, parsed: ParsedMail) => {
                if (parseErr) {
                  logger.error('Failed to parse email:', parseErr);
                  return;
                }

                const email = this.convertParsedMail(parsed);
                if (email) {
                  emails.push(email);
                }
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            logger.error('Fetch error:', fetchErr);
            resolve(emails);
          });

          fetch.once('end', () => {
            // Wait a bit for all parsing to complete
            setTimeout(() => resolve(emails), 1000);
          });
        });
      });
    });
  }

  private convertParsedMail(parsed: ParsedMail): ParsedEmail | null {
    try {
      const fromAddress = parsed.from?.value[0];
      const toAddresses = parsed.to
        ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
            .flatMap(addr => addr.value.map(v => v.address || ''))
            .filter(Boolean)
        : [];

      const attachments = (parsed.attachments || []).map((att: Attachment) => ({
        filename: att.filename || 'attachment',
        contentType: att.contentType,
        size: att.size,
        content: att.content,
      }));

      return {
        messageId: parsed.messageId || uuidv4(),
        from: fromAddress?.address || 'unknown@unknown.com',
        fromName: fromAddress?.name,
        to: toAddresses,
        subject: parsed.subject || '(No Subject)',
        textBody: parsed.text,
        htmlBody: parsed.html || undefined,
        date: parsed.date || new Date(),
        attachments,
      };
    } catch (error) {
      logger.error('Failed to convert parsed mail:', error);
      return null;
    }
  }

  async processEmail(email: ParsedEmail): Promise<EmailProcessResult> {
    try {
      // Try to find case by email subject pattern (e.g., "Re: Case 2024-PI-0001")
      const caseNumber = this.extractCaseNumber(email.subject);
      let caseId: string | null = null;

      if (caseNumber) {
        // Find existing case
        const caseResult = await query(
          'SELECT id, client_id FROM cases WHERE case_number = $1',
          [caseNumber]
        );
        if (caseResult.length > 0) {
          caseId = caseResult[0].id;
        }
      }

      // If no case found by number, try to find by sender email
      if (!caseId) {
        const userResult = await query(
          `SELECT c.id as case_id, c.case_number, cl.id as client_id
           FROM users u
           JOIN clients cl ON cl.user_id = u.id
           JOIN cases c ON c.client_id = cl.id
           WHERE u.email = $1
           ORDER BY c.created_at DESC
           LIMIT 1`,
          [email.from]
        );
        if (userResult.length > 0) {
          caseId = userResult[0].case_id;
          // clientId not used but kept for possible future use
        }
      }

      // Store the email in database
      const emailId = await this.storeEmail(email, caseId);

      // If we have a case, process attachments and log event
      if (caseId) {
        // Upload attachments as documents
        for (const attachment of email.attachments) {
          try {
            await documentService.uploadDocument(
              caseId,
              {
                buffer: attachment.content,
                originalname: attachment.filename,
                mimetype: attachment.contentType,
                size: attachment.size,
              },
              '', // No user ID for email attachments
              'client' as any,
              `Received via email: ${email.subject}`
            );
          } catch (attachErr) {
            logger.warn(`Failed to save attachment ${attachment.filename}:`, attachErr);
          }
        }

        // Log case event
        await caseEventRepository.create({
          case_id: caseId,
          event_type: CaseEventType.EMAIL_RECEIVED,
          description: `Email received from ${email.from}: ${email.subject}`,
          metadata: {
            email_id: emailId,
            from: email.from,
            subject: email.subject,
            attachments_count: email.attachments.length,
          },
        });

        logger.info(`Processed email for case ${caseId}: ${email.subject}`);

        const caseNumberResult = await query(
          'SELECT case_number FROM cases WHERE id = $1',
          [caseId]
        );

        return {
          success: true,
          emailId,
          caseId,
          caseNumber: caseNumberResult[0]?.case_number,
        };
      }

      // Email received but no matching case - still stored for review
      logger.info(`Email stored without case match: ${email.subject} from ${email.from}`);
      return {
        success: true,
        emailId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process email:', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private extractCaseNumber(subject: string): string | null {
    // Match patterns like "2024-PI-0001" or "Case 2024-FL-0123"
    const patterns = [
      /\b(\d{4}-[A-Z]{2}-\d{4})\b/,
      /Case[:\s]+(\d{4}-[A-Z]{2}-\d{4})/i,
      /Re:\s*.*?(\d{4}-[A-Z]{2}-\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  private async storeEmail(email: ParsedEmail, caseId: string | null): Promise<string> {
    const emailId = uuidv4();

    await query(
      `INSERT INTO emails (id, case_id, message_id, direction, sender, recipient, subject, body_text, body_html, received_at, created_at)
       VALUES ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9, NOW())`,
      [
        emailId,
        caseId,
        email.messageId,
        email.from,
        email.to.join(', '),
        email.subject,
        email.textBody || null,
        email.htmlBody || null,
        email.date,
      ]
    );

    return emailId;
  }

  async startPolling(intervalMs: number = 60000): Promise<void> {
    if (!this.isConfigured) {
      logger.warn('IMAP not configured - polling not started');
      return;
    }

    logger.info(`Starting email polling every ${intervalMs / 1000} seconds`);

    // Initial fetch
    await this.pollEmails();

    // Set up interval
    this.pollingInterval = setInterval(async () => {
      await this.pollEmails();
    }, intervalMs);
  }

  private async pollEmails(): Promise<void> {
    try {
      const emails = await this.fetchUnreadEmails();

      for (const email of emails) {
        await this.processEmail(email);
      }

      if (emails.length > 0) {
        logger.info(`Processed ${emails.length} email(s)`);
      }
    } catch (error) {
      logger.error('Error during email polling:', error);
    }
  }

  async stopPolling(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('Email polling stopped');
    }
    await this.disconnect();
  }
}

export const imapService = new ImapService();
