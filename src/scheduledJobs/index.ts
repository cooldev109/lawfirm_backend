import cron from 'node-cron';
import { logger } from '../utils/logger';
import { weeklySummaryJob } from './weeklySummaryJob';
import { inactivityCheckJob } from './inactivityCheckJob';

export const initializeScheduledJobs = (): void => {
  logger.info('Initializing scheduled jobs...');

  // Weekly Summary Email - Every Monday at 8:00 AM
  cron.schedule('0 8 * * 1', async () => {
    logger.info('Running weekly summary job...');
    try {
      await weeklySummaryJob.run();
      logger.info('Weekly summary job completed successfully');
    } catch (error) {
      logger.error('Weekly summary job failed:', error);
    }
  }, {
    timezone: process.env.BUSINESS_TIMEZONE || 'America/New_York',
  });

  // Inactivity Check - Daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running inactivity check job...');
    try {
      await inactivityCheckJob.run();
      logger.info('Inactivity check job completed successfully');
    } catch (error) {
      logger.error('Inactivity check job failed:', error);
    }
  }, {
    timezone: process.env.BUSINESS_TIMEZONE || 'America/New_York',
  });

  logger.info('Scheduled jobs initialized:');
  logger.info('  - Weekly Summary: Every Monday at 8:00 AM');
  logger.info('  - Inactivity Check: Daily at 9:00 AM');
};

// Manual trigger functions for testing/admin use
export const triggerWeeklySummary = async (): Promise<void> => {
  logger.info('Manually triggering weekly summary job...');
  await weeklySummaryJob.run();
};

export const triggerInactivityCheck = async (): Promise<void> => {
  logger.info('Manually triggering inactivity check job...');
  await inactivityCheckJob.run();
};
