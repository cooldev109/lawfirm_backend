import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { config, testConnection } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import routes from './routes';
import { initializeScheduledJobs } from './scheduledJobs';

const app: Express = express();

// Ensure storage directories exist
const storagePath = path.resolve(config.storage.path);
const logsPath = path.resolve(config.logging.filePath);

if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
  logger.info(`Created storage directory: ${storagePath}`);
}

if (!fs.existsSync(logsPath)) {
  fs.mkdirSync(logsPath, { recursive: true });
  logger.info(`Created logs directory: ${logsPath}`);
}

// Security middleware
app.use(helmet());

// CORS configuration - allow all origins in development
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Apply global rate limiting (skip in development if needed)
if (config.nodeEnv === 'production') {
  app.use(apiLimiter);
  logger.info('Rate limiting enabled');
}

// Health check endpoint with detailed status
app.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  let dbStatus = 'unknown';

  try {
    const dbConnected = await testConnection();
    dbStatus = dbConnected ? 'connected' : 'disconnected';
  } catch {
    dbStatus = 'error';
  }

  const responseTime = Date.now() - startTime;

  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0',
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
      responseTimeMs: responseTime,
    },
  });
});

// Readiness check (for load balancers)
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    const dbConnected = await testConnection();
    if (dbConnected) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'database unavailable' });
    }
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'health check failed' });
  }
});

// API info endpoint
app.get(`${config.apiPrefix}`, (_req: Request, res: Response) => {
  res.json({
    message: 'Lawyer System API',
    version: '1.0.0',
    endpoints: {
      auth: `${config.apiPrefix}/auth`,
      cases: `${config.apiPrefix}/cases`,
      clients: `${config.apiPrefix}/clients`,
      documents: `${config.apiPrefix}/documents`,
    },
  });
});

// API routes
app.use(config.apiPrefix, routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Please check your configuration.');
      process.exit(1);
    }

    // Initialize scheduled jobs (cron jobs for automation)
    initializeScheduledJobs();

    server = app.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API Prefix: ${config.apiPrefix}`);
      logger.info(`Frontend URL: ${config.frontendUrl}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
let server: ReturnType<typeof app.listen>;

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

export default app;
