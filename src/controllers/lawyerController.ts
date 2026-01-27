import { Request, Response, NextFunction } from 'express';
import { lawyerService } from '../services/lawyerService';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { UserRole } from '../types';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export const lawyerController = {
  async getClients(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const clients = await lawyerService.getClientsForLawyer(
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: clients,
      });
    } catch (error) {
      next(error);
    }
  },

  async getClientById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new BadRequestError('User not authenticated');
      }

      const { clientId } = req.params;
      const client = await lawyerService.getClientById(clientId);

      if (!client) {
        throw new NotFoundError('Client not found');
      }

      res.json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  },
};
