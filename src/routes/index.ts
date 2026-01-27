import { Router } from 'express';
import authRoutes from './authRoutes';
import caseRoutes from './caseRoutes';
import documentRoutes from './documentRoutes';
import intakeRoutes from './intakeRoutes';
import emailRoutes from './emailRoutes';
import notificationRoutes from './notificationRoutes';
import adminRoutes from './adminRoutes';
import messageRoutes from './messageRoutes';
import lawyerRoutes from './lawyerRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/cases', caseRoutes);
router.use('/documents', documentRoutes);
router.use('/intake', intakeRoutes);
router.use('/emails', emailRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/messages', messageRoutes);
router.use('/lawyers', lawyerRoutes);

export default router;
