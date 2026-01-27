import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// General API rate limiter - 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, _next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// Stricter rate limiter for authentication endpoints - 30 requests per 15 minutes (relaxed for dev)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login attempts per windowMs
  message: {
    success: false,
    error: 'Too many login attempts, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
  skipSuccessfulRequests: true, // Don't count successful logins
});

// Rate limiter for file uploads - 10 uploads per hour
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    success: false,
    error: 'Too many file uploads, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// Rate limiter for password reset - 3 requests per hour
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 reset requests per hour
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// Rate limiter for intake form submissions - 5 per hour per IP
export const intakeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 intake submissions per hour
  message: {
    success: false,
    error: 'Too many case submissions, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Intake rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});
