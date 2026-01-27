import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/documentService';
import { BadRequestError } from '../utils/errors';
import { JwtPayload } from '../types';

interface AuthRequest extends Request {
  user?: JwtPayload;
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
}

export const documentController = {
  async uploadDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;
      const { description } = req.body;
      const file = req.file;

      if (!file) {
        throw new BadRequestError('No file uploaded');
      }

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const uploadedFile = {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };

      const document = await documentService.uploadDocument(
        caseId,
        uploadedFile,
        req.user.userId,
        req.user.role,
        description
      );

      res.status(201).json({
        success: true,
        data: document,
        message: 'Document uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async uploadMultipleDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;
      const { description } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded');
      }

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const uploadedFiles = files.map(file => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      }));

      const documents = await documentService.uploadDocuments(
        caseId,
        uploadedFiles,
        req.user.userId,
        req.user.role,
        description
      );

      res.status(201).json({
        success: true,
        data: documents,
        message: `${documents.length} documents uploaded successfully`,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDocumentById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const document = await documentService.getDocumentById(
        documentId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDocumentsByCaseId(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const documents = await documentService.getDocumentsByCaseId(
        caseId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      next(error);
    }
  },

  async downloadDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const { buffer, document } = await documentService.downloadDocument(
        documentId,
        req.user.userId,
        req.user.role
      );

      res.setHeader('Content-Type', document.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async deleteDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;

      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      await documentService.deleteDocument(
        documentId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
