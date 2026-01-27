import { caseRepository, caseEventRepository, CreateCaseData, UpdateCaseData, CaseFilters, PaginationOptions } from '../repositories/caseRepository';
import { clientRepository, lawyerRepository, userRepository } from '../repositories/userRepository';
import { notificationService } from './notificationService';
import { emailNotificationService } from './emailNotificationService';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { Case, CaseEventType, UserRole } from '../types';
import { logger } from '../utils/logger';

export interface CaseWithDetails extends Case {
  client?: {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    company_name?: string;
  };
  lawyer?: {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    specialization?: string;
  };
  document_count?: number;
}

export const caseService = {
  async createCase(data: CreateCaseData, actorId?: string): Promise<Case> {
    // Validate client exists
    const client = await clientRepository.findById(data.client_id);
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    // Validate lawyer if provided
    if (data.lawyer_id) {
      const lawyer = await lawyerRepository.findById(data.lawyer_id);
      if (!lawyer) {
        throw new NotFoundError('Lawyer not found');
      }
    }

    const newCase = await caseRepository.createWithEvent(data, actorId);
    logger.info(`Case created: ${newCase.case_number} for client ${data.client_id}`);

    // Get lawyer name if assigned
    let lawyerName: string | undefined;
    if (data.lawyer_id) {
      const lawyer = await lawyerRepository.findById(data.lawyer_id);
      if (lawyer) {
        const lawyerUser = await userRepository.findById(lawyer.user_id);
        if (lawyerUser) {
          lawyerName = `${lawyerUser.first_name} ${lawyerUser.last_name}`;
        }
      }
    }

    // Send notifications (non-blocking)
    this.sendCaseCreationNotifications(
      client.user_id,
      newCase.id,
      newCase.case_number,
      newCase.title || 'New Case',
      data.case_type || 'other',
      data.lawyer_id,
      lawyerName
    ).catch(err => logger.warn('Failed to send case creation notifications:', err));

    return newCase;
  },

  async sendCaseCreationNotifications(
    clientUserId: string,
    caseId: string,
    caseNumber: string,
    caseTitle: string,
    caseType: string,
    lawyerId?: string,
    lawyerName?: string
  ): Promise<void> {
    const user = await userRepository.findById(clientUserId);
    if (!user) return;

    const clientName = `${user.first_name} ${user.last_name}`;

    // 1. Send in-app notification to client
    await notificationService.notifyClientCaseCreated(
      clientUserId,
      caseNumber,
      caseType,
      caseId,
      lawyerName
    );

    // 2. Send email to client
    await emailNotificationService.notifyCaseSubmitted(user.email, clientName, caseNumber, caseTitle);

    // 3. Notify admins about new case
    await notificationService.notifyAdminsNewCase(clientName, caseNumber, caseType, caseId, lawyerName);

    // 4. If lawyer was pre-assigned, notify them too
    if (lawyerId) {
      await notificationService.notifyLawyerNewCase(lawyerId, clientName, caseNumber, caseType, caseId);
    }
  },

  async getCaseById(caseId: string, userId: string, userRole: UserRole): Promise<CaseWithDetails> {
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check authorization
    await this.checkCaseAccess(caseRecord, userId, userRole);

    return caseRecord;
  },

  async getCaseByCaseNumber(caseNumber: string, userId: string, userRole: UserRole): Promise<CaseWithDetails> {
    const caseRecord = await caseRepository.findByCaseNumber(caseNumber);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    await this.checkCaseAccess(caseRecord, userId, userRole);

    return caseRecord;
  },

  async listCases(
    filters: CaseFilters,
    pagination: PaginationOptions,
    userId: string,
    userRole: UserRole
  ): Promise<{ cases: Case[]; total: number; page: number; limit: number; totalPages: number }> {
    // Apply role-based filters
    if (userRole === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (!client) {
        throw new ForbiddenError('Client profile not found');
      }
      filters.client_id = client.id;
    } else if (userRole === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (!lawyer) {
        throw new ForbiddenError('Lawyer profile not found');
      }
      filters.lawyer_id = lawyer.id;
    }
    // Admins can see all cases

    const { cases, total } = await caseRepository.findAll(filters, pagination);
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const totalPages = Math.ceil(total / limit);

    return { cases, total, page, limit, totalPages };
  },

  async updateCase(
    caseId: string,
    data: UpdateCaseData,
    userId: string,
    userRole: UserRole
  ): Promise<Case> {
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check authorization
    if (userRole === UserRole.CLIENT) {
      throw new ForbiddenError('Clients cannot update cases directly');
    }

    await this.checkCaseAccess(caseRecord, userId, userRole);

    const updatedCase = await caseRepository.update(caseId, data);
    if (!updatedCase) {
      throw new NotFoundError('Case not found');
    }

    // Log status change event and notify client
    if (data.status && data.status !== caseRecord.status) {
      await caseEventRepository.create({
        case_id: caseId,
        event_type: CaseEventType.STATUS_CHANGED,
        actor_id: userId,
        description: `Status changed from "${caseRecord.status}" to "${data.status}"`,
        metadata: { old_status: caseRecord.status, new_status: data.status },
      });

      // Notify client about status change (non-blocking)
      notificationService.notifyClientCaseStatusUpdate(
        caseId,
        data.status,
        caseRecord.case_number,
        caseRecord.status // Pass old status for email
      ).catch(err => {
        logger.warn('Failed to notify client about status change:', err);
      });
    }

    logger.info(`Case ${caseRecord.case_number} updated by user ${userId}`);

    return updatedCase;
  },

  async assignLawyer(caseId: string, lawyerId: string, assignedBy: string): Promise<Case> {
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    const lawyer = await lawyerRepository.findById(lawyerId);
    if (!lawyer) {
      throw new NotFoundError('Lawyer not found');
    }

    const updatedCase = await caseRepository.assignLawyer(caseId, lawyerId);
    if (!updatedCase) {
      throw new NotFoundError('Case not found');
    }

    await caseEventRepository.create({
      case_id: caseId,
      event_type: CaseEventType.LAWYER_ASSIGNED,
      actor_id: assignedBy,
      description: `Lawyer assigned to case`,
      metadata: { lawyer_id: lawyerId },
    });

    logger.info(`Lawyer ${lawyerId} assigned to case ${caseRecord.case_number}`);

    // Notify client and lawyer about the assignment (non-blocking)
    this.notifyLawyerAssignment(caseId, caseRecord.case_number, lawyerId).catch(err => {
      logger.warn('Failed to send lawyer assignment notifications:', err);
    });

    return updatedCase;
  },

  async notifyLawyerAssignment(caseId: string, caseNumber: string, lawyerId: string): Promise<void> {
    // Get lawyer name
    const lawyer = await lawyerRepository.findById(lawyerId);
    if (!lawyer) return;

    const lawyerUser = await userRepository.findById(lawyer.user_id);
    if (!lawyerUser) return;

    const lawyerName = `${lawyerUser.first_name} ${lawyerUser.last_name}`;

    // Notify client that a lawyer was assigned
    await notificationService.notifyClientLawyerAssigned(caseId, caseNumber, lawyerName);

    // Notify lawyer about new case assignment
    // Get client name for the notification
    const caseRecord = await caseRepository.findById(caseId);
    if (caseRecord) {
      const client = await clientRepository.findById(caseRecord.client_id);
      if (client) {
        const clientUser = await userRepository.findById(client.user_id);
        if (clientUser) {
          const clientName = `${clientUser.first_name} ${clientUser.last_name}`;
          await notificationService.notifyLawyerNewCase(
            lawyerId,
            clientName,
            caseNumber,
            caseRecord.case_type || 'other',
            caseId
          );
        }
      }
    }
  },

  async autoAssignLawyer(caseId: string): Promise<Case | null> {
    const availableLawyer = await lawyerRepository.findAvailableForAssignment();
    if (!availableLawyer) {
      logger.warn(`No available lawyer for auto-assignment to case ${caseId}`);
      return null;
    }

    return this.assignLawyer(caseId, availableLawyer.id, availableLawyer.user_id);
  },

  async getCaseTimeline(caseId: string, userId: string, userRole: UserRole) {
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    await this.checkCaseAccess(caseRecord, userId, userRole);

    return caseEventRepository.getTimeline(caseId);
  },

  async addCaseEvent(
    caseId: string,
    eventType: CaseEventType,
    description: string,
    actorId?: string,
    metadata?: Record<string, any>
  ) {
    return caseEventRepository.create({
      case_id: caseId,
      event_type: eventType,
      actor_id: actorId,
      description,
      metadata,
    });
  },

  async getInactiveCases(daysThreshold: number): Promise<Case[]> {
    return caseRepository.findInactiveCases(daysThreshold);
  },

  async checkCaseAccess(caseRecord: Case, userId: string, userRole: UserRole): Promise<void> {
    if (userRole === UserRole.ADMIN) {
      return; // Admins can access all cases
    }

    if (userRole === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (!client || client.id !== caseRecord.client_id) {
        throw new ForbiddenError('You do not have access to this case');
      }
    }

    if (userRole === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (!lawyer || lawyer.id !== caseRecord.lawyer_id) {
        throw new ForbiddenError('You are not assigned to this case');
      }
    }
  },

  async getCaseStats(userId: string, userRole: UserRole): Promise<{
    total: number;
    byStatus: Record<string, number>;
    recentCases: Case[];
  }> {
    const filters: CaseFilters = {};

    // Apply role-based filters
    if (userRole === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (client) {
        filters.client_id = client.id;
      }
    } else if (userRole === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (lawyer) {
        filters.lawyer_id = lawyer.id;
      }
    }

    // Get stats from repository
    const stats = await caseRepository.getStats(filters);

    // Get recent cases
    const { cases: recentCases } = await caseRepository.findAll(filters, {
      limit: 5,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });

    return {
      ...stats,
      recentCases,
    };
  },

  async getAvailableLawyers(): Promise<Array<{
    id: string;
    first_name: string;
    last_name: string;
    specialization?: string;
  }>> {
    const lawyers = await lawyerRepository.findAll();

    // Filter to only available and active lawyers
    return lawyers
      .filter(l => l.is_available && (l.user as any)?.is_active !== false)
      .map(l => ({
        id: l.id,
        first_name: (l.user as any)?.first_name || '',
        last_name: (l.user as any)?.last_name || '',
        specialization: l.specialization,
      }));
  },
};
