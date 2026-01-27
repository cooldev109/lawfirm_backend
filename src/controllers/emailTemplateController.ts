import { Request, Response, NextFunction } from 'express';
import { emailTemplateService, UpdateTemplateInput } from '../services/emailTemplateService';
import { BadRequestError } from '../utils/errors';

export const emailTemplateController = {
  /**
   * Get all email templates
   */
  async getAllTemplates(_req: Request, res: Response, next: NextFunction) {
    try {
      const templates = await emailTemplateService.getAllTemplates();
      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a single template by ID
   */
  async getTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const template = await emailTemplateService.getTemplateById(id);

      if (!template) {
        throw new BadRequestError('Template not found');
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a template
   */
  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const input: UpdateTemplateInput = req.body;

      // Validate input
      if (input.subject !== undefined && input.subject.trim() === '') {
        throw new BadRequestError('Subject cannot be empty');
      }
      if (input.html_content !== undefined && input.html_content.trim() === '') {
        throw new BadRequestError('HTML content cannot be empty');
      }

      const template = await emailTemplateService.updateTemplate(id, input);
      res.json({
        success: true,
        data: template,
        message: 'Template updated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reset a template to default
   */
  async resetTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const template = await emailTemplateService.resetTemplate(id);
      res.json({
        success: true,
        data: template,
        message: 'Template reset to default successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview a template with sample data
   */
  async previewTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const sampleData = req.body.data as Record<string, string> | undefined;

      const preview = await emailTemplateService.previewTemplate(id, sampleData);
      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get sample data for a template
   */
  async getSampleData(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const template = await emailTemplateService.getTemplateById(id);

      if (!template) {
        throw new BadRequestError('Template not found');
      }

      const sampleData = emailTemplateService.getSampleData(template.template_key);
      res.json({
        success: true,
        data: {
          variables: template.variables,
          sampleData,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
