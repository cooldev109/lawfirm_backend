import { Router } from 'express';
import multer from 'multer';
import { documentController } from '../controllers/documentController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// All routes require authentication
router.use(authenticate);

// Upload single document to a case
router.post(
  '/cases/:caseId/upload',
  upload.single('file'),
  documentController.uploadDocument
);

// Upload multiple documents to a case
router.post(
  '/cases/:caseId/upload-multiple',
  upload.array('files', 10), // Max 10 files
  documentController.uploadMultipleDocuments
);

// Get all documents for a case
router.get(
  '/cases/:caseId',
  documentController.getDocumentsByCaseId
);

// Get single document metadata
router.get(
  '/:documentId',
  documentController.getDocumentById
);

// Download document
router.get(
  '/:documentId/download',
  documentController.downloadDocument
);

// Delete document (admin or uploader only)
router.delete(
  '/:documentId',
  documentController.deleteDocument
);

export default router;
