import { documentRepository } from '../repositories/documentRepository';
import { caseRepository, caseEventRepository } from '../repositories/caseRepository';
import { storageService, UploadedFile } from './storageService';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { Document, CaseEventType, UserRole } from '../types';
import { clientRepository, lawyerRepository, userRepository } from '../repositories/userRepository';
import { notificationService } from './notificationService';
import { logger } from '../utils/logger';

export const documentService = {
  async uploadDocument(
    caseId: string,
    file: UploadedFile,
    uploaderId: string,
    userRole: UserRole,
    description?: string
  ): Promise<Document> {
    // Validate case exists
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    // Check access
    await this.checkDocumentAccess(caseRecord.client_id, caseRecord.lawyer_id, uploaderId, userRole);

    // Validate file type
    if (!storageService.isAllowedMimeType(file.mimetype)) {
      throw new BadRequestError(`File type ${file.mimetype} is not allowed`);
    }

    // Save file to storage
    const storedFile = await storageService.saveFile(caseId, file);

    // Create document record
    const document = await documentRepository.create({
      case_id: caseId,
      uploaded_by: uploaderId,
      filename: storedFile.filename,
      original_filename: storedFile.originalFilename,
      mime_type: storedFile.mimeType,
      file_size: storedFile.fileSize,
      storage_path: storedFile.storagePath,
      description,
    });

    // Log event
    await caseEventRepository.create({
      case_id: caseId,
      event_type: CaseEventType.DOCUMENT_UPLOADED,
      actor_id: uploaderId,
      description: `Document uploaded: ${storedFile.originalFilename}`,
      metadata: {
        document_id: document.id,
        filename: storedFile.originalFilename,
        file_size: storedFile.fileSize,
      },
    });

    logger.info(`Document uploaded to case ${caseRecord.case_number}: ${storedFile.originalFilename}`);

    // Send notifications (non-blocking)
    this.sendDocumentUploadNotifications(
      caseId,
      caseRecord.case_number,
      uploaderId,
      userRole,
      storedFile.originalFilename
    ).catch(err => {
      logger.warn('Failed to send document upload notifications:', err);
    });

    return document;
  },

  async sendDocumentUploadNotifications(
    caseId: string,
    caseNumber: string,
    uploaderId: string,
    uploaderRole: UserRole,
    documentName: string
  ): Promise<void> {
    // Get uploader name
    const uploader = await userRepository.findById(uploaderId);
    const uploaderName = uploader
      ? `${uploader.first_name} ${uploader.last_name}`
      : 'Someone';

    // If a client uploaded, notify the lawyer
    if (uploaderRole === UserRole.CLIENT) {
      await notificationService.notifyLawyerDocumentUploaded(
        caseId,
        caseNumber,
        uploaderName,
        documentName
      );
    }

    // If a lawyer or admin uploaded, notify the client
    if (uploaderRole === UserRole.LAWYER || uploaderRole === UserRole.ADMIN) {
      await notificationService.notifyClientDocumentUploaded(
        caseId,
        caseNumber,
        uploaderName,
        documentName
      );
    }
  },

  async uploadDocuments(
    caseId: string,
    files: UploadedFile[],
    uploaderId: string,
    userRole: UserRole,
    description?: string
  ): Promise<Document[]> {
    const documents: Document[] = [];

    for (const file of files) {
      const document = await this.uploadDocument(caseId, file, uploaderId, userRole, description);
      documents.push(document);
    }

    return documents;
  },

  async getDocumentById(
    documentId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Document> {
    const document = await documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const caseRecord = await caseRepository.findById(document.case_id);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    await this.checkDocumentAccess(caseRecord.client_id, caseRecord.lawyer_id, userId, userRole);

    return document;
  },

  async getDocumentsByCaseId(
    caseId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Document[]> {
    const caseRecord = await caseRepository.findById(caseId);
    if (!caseRecord) {
      throw new NotFoundError('Case not found');
    }

    await this.checkDocumentAccess(caseRecord.client_id, caseRecord.lawyer_id, userId, userRole);

    return documentRepository.findByCaseId(caseId);
  },

  async downloadDocument(
    documentId: string,
    userId: string,
    userRole: UserRole
  ): Promise<{ buffer: Buffer; document: Document }> {
    const document = await this.getDocumentById(documentId, userId, userRole);

    if (!storageService.fileExists(document.storage_path)) {
      throw new NotFoundError('Document file not found');
    }

    const buffer = await storageService.getFileBuffer(document.storage_path);

    // Log download event
    const caseRecord = await caseRepository.findById(document.case_id);
    if (caseRecord) {
      await caseEventRepository.create({
        case_id: document.case_id,
        event_type: CaseEventType.DOCUMENT_DOWNLOADED,
        actor_id: userId,
        description: `Document downloaded: ${document.original_filename}`,
        metadata: { document_id: document.id, filename: document.original_filename },
      });
    }

    return { buffer, document };
  },

  async deleteDocument(
    documentId: string,
    userId: string,
    userRole: UserRole
  ): Promise<void> {
    const document = await documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Only admins and the uploader can delete
    if (userRole !== UserRole.ADMIN && document.uploaded_by !== userId) {
      throw new ForbiddenError('You do not have permission to delete this document');
    }

    // Delete file from storage
    await storageService.deleteFile(document.storage_path);

    // Delete database record
    await documentRepository.delete(documentId);

    logger.info(`Document deleted: ${document.original_filename}`);
  },

  async checkDocumentAccess(
    clientId: string,
    lawyerId: string | null | undefined,
    userId: string,
    userRole: UserRole
  ): Promise<void> {
    if (userRole === UserRole.ADMIN) {
      return; // Admins can access all documents
    }

    if (userRole === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (!client || client.id !== clientId) {
        throw new ForbiddenError('You do not have access to these documents');
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
