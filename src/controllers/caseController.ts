import { Request, Response, NextFunction } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { caseService } from '../services/caseService';
import { validate } from '../middleware/validate';
import { CaseStatus } from '../types';

export const caseValidation = {
  create: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('case_type').optional().trim(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5'),
    body('lawyer_id').optional().isUUID().withMessage('Invalid lawyer ID'),
  ],
  update: [
    param('id').isUUID().withMessage('Invalid case ID'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().trim(),
    body('status').optional().isIn(Object.values(CaseStatus)).withMessage('Invalid status'),
    body('case_type').optional().trim(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5'),
    body('lawyer_id').optional().isUUID().withMessage('Invalid lawyer ID'),
  ],
  getById: [
    param('id').isUUID().withMessage('Invalid case ID'),
  ],
  assignLawyer: [
    param('id').isUUID().withMessage('Invalid case ID'),
    body('lawyer_id').isUUID().withMessage('Lawyer ID is required'),
  ],
  list: [
    queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    queryValidator('status').optional().isIn(Object.values(CaseStatus)).withMessage('Invalid status'),
    queryValidator('search').optional().trim(),
  ],
};

export const caseController = {
  create: [
    validate(caseValidation.create),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // For client users, get their client_id
        const { clientRepository } = await import('../repositories/userRepository');
        const client = await clientRepository.findByUserId(req.user!.userId);

        if (!client) {
          res.status(400).json({
            success: false,
            error: 'Client profile not found',
          });
          return;
        }

        const newCase = await caseService.createCase(
          {
            client_id: client.id,
            title: req.body.title,
            description: req.body.description,
            case_type: req.body.case_type,
            priority: req.body.priority,
            lawyer_id: req.body.lawyer_id,
          },
          req.user!.userId
        );

        res.status(201).json({
          success: true,
          data: newCase,
          message: 'Case created successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  getById: [
    validate(caseValidation.getById),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const caseRecord = await caseService.getCaseById(
          req.params.id,
          req.user!.userId,
          req.user!.role
        );

        res.json({
          success: true,
          data: caseRecord,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  list: [
    validate(caseValidation.list),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const filters = {
          status: req.query.status as CaseStatus | undefined,
          case_type: req.query.case_type as string | undefined,
          search: req.query.search as string | undefined,
        };

        const pagination = {
          page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
          sortBy: req.query.sortBy as string | undefined,
          sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined,
        };

        const result = await caseService.listCases(
          filters,
          pagination,
          req.user!.userId,
          req.user!.role
        );

        res.json({
          success: true,
          data: result.cases,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  update: [
    validate(caseValidation.update),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const updatedCase = await caseService.updateCase(
          req.params.id,
          {
            title: req.body.title,
            description: req.body.description,
            status: req.body.status,
            case_type: req.body.case_type,
            priority: req.body.priority,
            lawyer_id: req.body.lawyer_id,
          },
          req.user!.userId,
          req.user!.role
        );

        res.json({
          success: true,
          data: updatedCase,
          message: 'Case updated successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  assignLawyer: [
    validate(caseValidation.assignLawyer),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const updatedCase = await caseService.assignLawyer(
          req.params.id,
          req.body.lawyer_id,
          req.user!.userId
        );

        res.json({
          success: true,
          data: updatedCase,
          message: 'Lawyer assigned successfully',
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  getTimeline: [
    validate(caseValidation.getById),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const timeline = await caseService.getCaseTimeline(
          req.params.id,
          req.user!.userId,
          req.user!.role
        );

        res.json({
          success: true,
          data: timeline,
        });
      } catch (error) {
        next(error);
      }
    },
  ],

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await caseService.getCaseStats(
        req.user!.userId,
        req.user!.role
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAvailableLawyers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lawyers = await caseService.getAvailableLawyers();

      res.json({
        success: true,
        data: lawyers,
      });
    } catch (error) {
      next(error);
    }
  },
};
