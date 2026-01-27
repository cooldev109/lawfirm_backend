import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { documentController } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';

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
  (req: Request, res: Response, next: NextFunction) => documentController.uploadDocument(req as any, res, next)
);

// Upload multiple documents to a case
router.post(
  '/cases/:caseId/upload-multiple',
  upload.array('files', 10), // Max 10 files
  (req: Request, res: Response, next: NextFunction) => documentController.uploadMultipleDocuments(req as any, res, next)
);

// Get all documents for a case
router.get(
  '/cases/:caseId',
  (req: Request, res: Response, next: NextFunction) => documentController.getDocumentsByCaseId(req as any, res, next)
);

// Get single document metadata
router.get(
  '/:documentId',
  (req: Request, res: Response, next: NextFunction) => documentController.getDocumentById(req as any, res, next)
);

// Download document
router.get(
  '/:documentId/download',
  (req: Request, res: Response, next: NextFunction) => documentController.downloadDocument(req as any, res, next)
);

// Delete document (admin or uploader only)
router.delete(
  '/:documentId',
  (req: Request, res: Response, next: NextFunction) => documentController.deleteDocument(req as any, res, next)
);

export default router;
