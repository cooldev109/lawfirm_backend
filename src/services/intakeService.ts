import { query, transaction } from '../config/database';
import { userRepository } from '../repositories/userRepository';
import { documentService } from './documentService';
import { emailService } from './emailService';
import { emailNotificationService } from './emailNotificationService';
import { notificationService } from './notificationService';
import { UploadedFile } from './storageService';
import { BadRequestError } from '../utils/errors';
import { CaseStatus, CaseType, CaseEventType, UserRole } from '../types';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface IntakeFormData {
  // Client information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;

  // Case information
  caseType: CaseType;
  description: string;
  lawyerId?: string; // Selected lawyer

  // Optional documents
  files?: UploadedFile[];
}

export interface IntakeResult {
  clientId: string;
  userId: string;
  caseId: string;
  caseNumber: string;
  documentsUploaded: number;
}

export const intakeService = {
  async processIntakeForm(data: IntakeFormData): Promise<IntakeResult> {
    // Check if user already exists
    const existingUser = await userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new BadRequestError('An account with this email already exists. Please login to submit a new case.');
    }

    // Hash the user-provided password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Use transaction for atomic operations
    const result = await transaction(async (client) => {
      // 1. Create user account
      const userId = uuidv4();
      await client.query(
        `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
        [userId, data.email, hashedPassword, UserRole.CLIENT, data.firstName, data.lastName, data.phone]
      );

      // 2. Create client profile
      const clientId = uuidv4();
      await client.query(
        `INSERT INTO clients (id, user_id, address, city, state, zip_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          clientId,
          userId,
          data.address || null,
          data.city || null,
          data.state || null,
          data.zipCode || null,
        ]
      );

      // 3. Generate case number and create case
      const caseNumber = await this.generateCaseNumber(data.caseType, client);
      const caseId = uuidv4();

      await client.query(
        `INSERT INTO cases (id, case_number, client_id, lawyer_id, case_type, title, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          caseId,
          caseNumber,
          clientId,
          data.lawyerId || null,  // lawyer_id references lawyers(id) directly
          data.caseType,
          `${data.caseType.replace(/_/g, ' ')} - ${data.firstName} ${data.lastName}`,
          data.description,
          CaseStatus.NEW,
        ]
      );

      // Update lawyer's case count if assigned
      if (data.lawyerId) {
        await client.query(
          'UPDATE lawyers SET current_case_count = current_case_count + 1 WHERE id = $1',
          [data.lawyerId]
        );
      }

      // 4. Log case creation event
      await client.query(
        `INSERT INTO case_events (case_id, event_type, actor_id, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          caseId,
          CaseEventType.CASE_CREATED,
          userId,
          'Case created via intake form',
          JSON.stringify({
            source: 'intake_form',
            client_name: `${data.firstName} ${data.lastName}`,
          }),
        ]
      );

      return {
        clientId,
        userId,
        caseId,
        caseNumber,
      };
    });

    // 5. Upload any attached documents (outside transaction since file operations shouldn't block DB)
    let documentsUploaded = 0;
    if (data.files && data.files.length > 0) {
      for (const file of data.files) {
        try {
          await documentService.uploadDocument(
            result.caseId,
            file,
            result.userId,
            UserRole.CLIENT,
            'Submitted via intake form'
          );
          documentsUploaded++;
        } catch (error) {
          logger.warn(`Failed to upload document ${file.originalname}: ${error}`);
        }
      }
    }

    logger.info(`Intake form processed: Case ${result.caseNumber} created for ${data.email}`);

    // 6. Send case submission confirmation email to client (non-blocking)
    const clientName = `${data.firstName} ${data.lastName}`;
    const caseTitle = `${data.caseType.replace(/_/g, ' ')} - ${clientName}`;

    // Send welcome email
    emailNotificationService.sendWelcomeEmail(data.email, clientName)
      .catch(err => logger.warn(`Error sending welcome email to ${data.email}:`, err));

    // Send case submission confirmation email
    emailNotificationService.notifyCaseSubmitted(data.email, clientName, result.caseNumber, caseTitle)
      .catch(err => logger.warn(`Error sending case submission email to ${data.email}:`, err));

    // 7. Notify assigned lawyer about new case (non-blocking)
    if (data.lawyerId) {
      // Send email notification
      this.notifyLawyerOfNewCase(
        data.lawyerId,
        `${data.firstName} ${data.lastName}`,
        result.caseNumber,
        data.caseType,
        data.description
      );

      // Create in-app notification for lawyer
      notificationService.notifyLawyerNewCase(
        data.lawyerId,
        `${data.firstName} ${data.lastName}`,
        result.caseNumber,
        data.caseType,
        result.caseId
      ).catch(err => {
        logger.warn('Failed to create in-app notification for lawyer:', err);
      });
    }

    // 8. Notify all admins about new case (in-app notification)
    this.getLawyerName(data.lawyerId).then(lawyerName => {
      notificationService.notifyAdminsNewCase(
        `${data.firstName} ${data.lastName}`,
        result.caseNumber,
        data.caseType,
        result.caseId,
        lawyerName
      ).catch(err => {
        logger.warn('Failed to create in-app notification for admins:', err);
      });

      // 9. Notify client about case creation (in-app notification)
      notificationService.notifyClientCaseCreated(
        result.userId,
        result.caseNumber,
        data.caseType,
        result.caseId,
        lawyerName
      ).catch(err => {
        logger.warn('Failed to create in-app notification for client:', err);
      });
    });

    return {
      ...result,
      documentsUploaded,
    };
  },

  async getLawyerName(lawyerId?: string): Promise<string | undefined> {
    if (!lawyerId) return undefined;
    const lawyers = await query(
      `SELECT u.first_name, u.last_name FROM lawyers l JOIN users u ON l.user_id = u.id WHERE l.id = $1`,
      [lawyerId]
    );
    if (lawyers.length > 0) {
      return `${lawyers[0].first_name} ${lawyers[0].last_name}`;
    }
    return undefined;
  },

  async generateCaseNumber(caseType: CaseType, client?: any): Promise<string> {
    const year = new Date().getFullYear();
    const typePrefix = this.getCaseTypePrefix(caseType);

    // Get the last case number for this year and type
    const queryFn = client ? client.query.bind(client) : async (text: string, params: any[]) => {
      const rows = await query(text, params);
      return { rows };
    };

    const result = await queryFn(
      `SELECT case_number FROM cases
       WHERE case_number LIKE $1
       ORDER BY created_at DESC LIMIT 1`,
      [`${year}-${typePrefix}-%`]
    );

    let sequence = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].case_number;
      const lastSequence = parseInt(lastNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }

    return `${year}-${typePrefix}-${sequence.toString().padStart(4, '0')}`;
  },

  getCaseTypePrefix(caseType: CaseType): string {
    const prefixes: Record<CaseType, string> = {
      [CaseType.PERSONAL_INJURY]: 'PI',
      [CaseType.FAMILY_LAW]: 'FL',
      [CaseType.CRIMINAL_DEFENSE]: 'CD',
      [CaseType.ESTATE_PLANNING]: 'EP',
      [CaseType.BUSINESS_LAW]: 'BL',
      [CaseType.REAL_ESTATE]: 'RE',
      [CaseType.IMMIGRATION]: 'IM',
      [CaseType.BANKRUPTCY]: 'BK',
      [CaseType.EMPLOYMENT]: 'EM',
      [CaseType.OTHER]: 'OT',
    };
    return prefixes[caseType] || 'OT';
  },

  async notifyLawyerOfNewCase(
    lawyerId: string,
    clientName: string,
    caseNumber: string,
    caseType: CaseType,
    _description: string
  ): Promise<void> {
    try {
      // Get lawyer's email and name
      const lawyers = await query(
        `SELECT u.email, u.first_name, u.last_name
         FROM lawyers l
         JOIN users u ON l.user_id = u.id
         WHERE l.id = $1`,
        [lawyerId]
      );

      if (lawyers.length === 0) {
        logger.warn(`Lawyer not found for notification: ${lawyerId}`);
        return;
      }

      const lawyer = lawyers[0];
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      emailService.sendLawyerNotification(
        lawyer.email,
        lawyerName,
        clientName,
        caseNumber,
        caseType
      )
        .then(result => {
          if (result.success) {
            logger.info(`New case notification sent to lawyer ${lawyer.email}`);
          } else {
            logger.warn(`Failed to notify lawyer ${lawyer.email}: ${result.error}`);
          }
        })
        .catch(err => {
          logger.warn(`Error notifying lawyer ${lawyer.email}:`, err);
        });
    } catch (error) {
      logger.error('Failed to notify lawyer of new case:', error);
    }
  },
};
