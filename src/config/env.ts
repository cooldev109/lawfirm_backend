import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'lawyer_system',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.EMAIL_FROM_NAME || 'Law Firm Case Management',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@lawfirm.com',
  },

  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    tls: process.env.IMAP_TLS === 'true',
  },

  storage: {
    path: process.env.STORAGE_PATH || './storage/documents',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    fromName: process.env.RESEND_FROM_NAME || 'Law Firm Case Management',
  },

  business: {
    hoursStart: parseInt(process.env.BUSINESS_HOURS_START || '9', 10),
    hoursEnd: parseInt(process.env.BUSINESS_HOURS_END || '18', 10),
    timezone: process.env.BUSINESS_TIMEZONE || 'America/New_York',
    inactivityDaysThreshold: parseInt(process.env.INACTIVITY_DAYS_THRESHOLD || '21', 10),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },
} as const;

export type Config = typeof config;
