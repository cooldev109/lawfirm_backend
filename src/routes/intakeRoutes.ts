import { Router } from 'express';
import multer from 'multer';
import { intakeController, intakeValidation } from '../controllers/intakeController';
import { intakeLimiter } from '../middleware/rateLimiter';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5, // Max 5 files
  },
});

// Public endpoint - no authentication required
// Submit intake form (creates client, case, and optionally uploads documents)
router.post(
  '/submit',
  intakeLimiter, // Rate limit intake submissions
  upload.array('files', 5),
  intakeValidation,
  intakeController.submitIntakeForm
);

// Get available case types
router.get('/case-types', intakeController.getCaseTypes);

// Get available lawyers for selection
router.get('/lawyers', intakeController.getAvailableLawyers);

export default router;
