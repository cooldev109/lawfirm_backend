import { messageRepository } from '../repositories/messageRepository';
import { caseRepository, caseEventRepository } from '../repositories/caseRepository';
import { clientRepository, lawyerRepository, userRepository } from '../repositories/userRepository';
import { notificationService } from './notificationService';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import { MessageWithSender, CaseEventType, UserRole } from '../types';
import { logger } from '../utils/logger';

export const messageService = {
  async sendMessage(
    caseId: string,
    senderId: string,
    senderRole: UserRole,
    content: string
  ): Promise<MessageWithSender> {
    // Validate content
    if (!content || !content.trim()) {
      throw new BadRequestError('Message content cannot be empty');
    }

    // Validate case exists
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check access - only the case's client and assigned lawyer can send messages
    await this.checkMessageAccess(caseRecord.client_id, caseRecord.lawyer_id, senderId, senderRole);

    // Create the message
    const message = await messageRepository.create({
      case_id: caseId,
      sender_id: senderId,
      content: content.trim(),
    });

    // Log the event
    await caseEventRepository.create({
      case_id: caseId,
      event_type: CaseEventType.MESSAGE_SENT,
      actor_id: senderId,
      description: 'Message sent',
      metadata: { message_id: message.id },
    });

    // Get sender details
    const sender = await userRepository.findById(senderId);
    const messageWithSender: MessageWithSender = {
      ...message,
      sender_first_name: sender?.first_name || 'Unknown',
      sender_last_name: sender?.last_name || 'User',
      sender_role: sender?.role || UserRole.CLIENT,
    };

    logger.info(`Message sent in case ${caseRecord.case_number} by user ${senderId}`);

    // Send notifications (non-blocking)
    this.sendMessageNotification(
      caseId,
      caseRecord.case_number,
      caseRecord.client_id,
      caseRecord.lawyer_id,
      senderId,
      senderRole,
      content.trim()
    ).catch(err => {
      logger.warn('Failed to send message notification:', err);
    });

    return messageWithSender;
  },

  async sendMessageNotification(
    caseId: string,
    caseNumber: string,
    _clientId: string,
    _lawyerId: string | null | undefined,
    senderId: string,
    _senderRole: UserRole,
    messageContent?: string
  ): Promise<void> {
    // Get sender name
    const sender = await userRepository.findById(senderId);
    const senderName = sender
      ? `${sender.first_name} ${sender.last_name}`
      : 'Someone';

    // Use the enhanced notifyNewMessage which handles both in-app and email notifications
    await notificationService.notifyNewMessage(
      caseId,
      caseNumber,
      senderId,
      senderName,
      messageContent || 'New message received'
    );
  },

  async getMessagesByCaseId(
    caseId: string,
    userId: string,
    userRole: UserRole
  ): Promise<MessageWithSender[]> {
    // Validate case exists
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check access
    await this.checkMessageAccess(caseRecord.client_id, caseRecord.lawyer_id, userId, userRole);

    // Get messages
    const messages = await messageRepository.findByCaseId(caseId);

    // Mark messages as read (for the other party's messages)
    await messageRepository.markAllAsReadForCase(caseId, userId);

    return messages;
  },

  async getUnreadCountForCase(
    caseId: string,
    userId: string,
    userRole: UserRole
  ): Promise<number> {
    // Validate case exists
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check access
    await this.checkMessageAccess(caseRecord.client_id, caseRecord.lawyer_id, userId, userRole);

    return messageRepository.getUnreadCountForCase(caseId, userId);
  },

  async markMessagesAsRead(
    caseId: string,
    userId: string,
    userRole: UserRole
  ): Promise<number> {
    // Validate case exists
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check access
    await this.checkMessageAccess(caseRecord.client_id, caseRecord.lawyer_id, userId, userRole);

    return messageRepository.markAllAsReadForCase(caseId, userId);
  },

  async checkMessageAccess(
    clientId: string,
    lawyerId: string | null | undefined,
    userId: string,
    userRole: UserRole
  ): Promise<void> {
    if (userRole === UserRole.ADMIN) {
      return; // Admins can access all messages
    }

    if (userRole === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (!client || client.id !== clientId) {
        throw new ForbiddenError('You do not have access to this case');
      }
    }

    if (userRole === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (!lawyer || lawyer.id !== lawyerId) {
        throw new ForbiddenError('You are not assigned to this case');
      }
    }
  },
};
