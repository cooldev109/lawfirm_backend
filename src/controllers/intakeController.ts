import { Request, Response, NextFunction } from 'express';
import { intakeService, IntakeFormData } from '../services/intakeService';
import { BadRequestError } from '../utils/errors';
import { CaseType } from '../types';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database';

interface IntakeRequest extends Request {
  files?: Express.Multer.File[];
}

export const intakeValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('caseType').isIn(Object.values(CaseType)).withMessage('Invalid case type'),
  body('description').trim().notEmpty().withMessage('Case description is required'),
];

export const intakeController = {
  async submitIntakeForm(req: IntakeRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError(errors.array().map(e => e.msg).join(', '));
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        password,
        address,
        city,
        state,
        zipCode,
        caseType,
        description,
        lawyerId,
      } = req.body;

      // Prepare uploaded files
      const files = req.files?.map(file => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      }));

      const intakeData: IntakeFormData = {
        firstName,
        lastName,
        email,
        phone,
        password,
        address,
        city,
        state,
        zipCode,
        caseType,
        description,
        lawyerId,
        files,
      };

      const result = await intakeService.processIntakeForm(intakeData);

      res.status(201).json({
        success: true,
        data: {
          caseNumber: result.caseNumber,
          message: 'Your case has been submitted successfully. You can now log in with your email and password.',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getCaseTypes(_req: Request, res: Response): Promise<void> {
    const caseTypes = Object.values(CaseType).map(type => ({
      value: type,
      label: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    }));

    res.json({
      success: true,
      data: caseTypes,
    });
  },

  async getAvailableLawyers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lawyers = await query(
        `SELECT l.id, u.first_name, u.last_name, l.specialization
         FROM lawyers l
         JOIN users u ON l.user_id = u.id
         WHERE l.is_available = true AND u.is_active = true
         ORDER BY u.last_name, u.first_name`
      );

      const lawyerOptions = lawyers.map(lawyer => ({
        value: lawyer.id,
        label: `${lawyer.first_name} ${lawyer.last_name}${lawyer.specialization ? ` - ${lawyer.specialization}` : ''}`,
      }));

      res.json({
        success: true,
        data: lawyerOptions,
      });
    } catch (error) {
      next(error);
    }
  },
};
