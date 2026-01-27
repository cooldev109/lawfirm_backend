import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepository, clientRepository, lawyerRepository, CreateUserData, CreateClientData, CreateLawyerData } from '../repositories/userRepository';
import { UnauthorizedError, BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { User, Client, Lawyer, UserRole, JwtPayload } from '../types';
import { logger } from '../utils/logger';
import { emailNotificationService } from './emailNotificationService';

const SALT_ROUNDS = 10;

export interface RegisterClientInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

export interface RegisterLawyerInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  bar_number?: string;
  specialization?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'password_hash'>;
  token: string;
  expiresIn: string;
}

function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function sanitizeUser(user: User): Omit<User, 'password_hash'> {
  const { password_hash, ...sanitized } = user;
  return sanitized;
}

export const authService = {
  async registerClient(input: RegisterClientInput): Promise<AuthResult & { client: Client }> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const userData: CreateUserData = {
      email: input.email,
      password_hash,
      role: UserRole.CLIENT,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone,
    };

    const clientData: Omit<CreateClientData, 'user_id'> = {
      company_name: input.company_name,
      address: input.address,
      city: input.city,
      state: input.state,
      zip_code: input.zip_code,
      country: input.country,
    };

    const { user, client } = await clientRepository.createWithUser(userData, clientData);

    logger.info(`New client registered: ${user.email}`);

    // Send welcome email (non-blocking)
    emailNotificationService.sendWelcomeEmail(
      user.email,
      `${user.first_name} ${user.last_name}`
    ).catch(err => logger.warn('Failed to send welcome email:', err));

    const token = generateToken(user);

    return {
      user: sanitizeUser(user),
      client,
      token,
      expiresIn: config.jwt.expiresIn,
    };
  },

  async registerLawyer(input: RegisterLawyerInput): Promise<AuthResult & { lawyer: Lawyer }> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const userData: CreateUserData = {
      email: input.email,
      password_hash,
      role: UserRole.LAWYER,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone,
    };

    const lawyerData: Omit<CreateLawyerData, 'user_id'> = {
      bar_number: input.bar_number,
      specialization: input.specialization,
    };

    const { user, lawyer } = await lawyerRepository.createWithUser(userData, lawyerData);

    logger.info(`New lawyer registered: ${user.email}`);

    const token = generateToken(user);

    return {
      user: sanitizeUser(user),
      lawyer,
      token,
      expiresIn: config.jwt.expiresIn,
    };
  },

  async registerAdmin(email: string, password: string, first_name: string, last_name: string): Promise<AuthResult> {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await userRepository.create({
      email,
      password_hash,
      role: UserRole.ADMIN,
      first_name,
      last_name,
    });

    logger.info(`New admin registered: ${user.email}`);

    const token = generateToken(user);

    return {
      user: sanitizeUser(user),
      token,
      expiresIn: config.jwt.expiresIn,
    };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await userRepository.updateLastLogin(user.id);

    logger.info(`User logged in: ${user.email}`);

    const token = generateToken(user);

    return {
      user: sanitizeUser(user),
      token,
      expiresIn: config.jwt.expiresIn,
    };
  },

  async getProfile(userId: string): Promise<{
    user: Omit<User, 'password_hash'>;
    client?: Client;
    lawyer?: Lawyer;
  }> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const result: {
      user: Omit<User, 'password_hash'>;
      client?: Client;
      lawyer?: Lawyer;
    } = {
      user: sanitizeUser(user),
    };

    if (user.role === UserRole.CLIENT) {
      const client = await clientRepository.findByUserId(userId);
      if (client) result.client = client;
    } else if (user.role === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (lawyer) result.lawyer = lawyer;
    }

    return result;
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userRepository.update(userId, { password_hash });

    logger.info(`Password changed for user: ${user.email}`);
  },

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  },

  async updateProfile(
    userId: string,
    data: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      // Lawyer-specific fields
      bar_number?: string;
      specialization?: string;
      is_available?: boolean;
      max_cases?: number;
    }
  ): Promise<{
    user: Omit<User, 'password_hash'>;
    lawyer?: Lawyer;
  }> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update user fields
    const userUpdate: Partial<CreateUserData> = {};
    if (data.first_name !== undefined) userUpdate.first_name = data.first_name;
    if (data.last_name !== undefined) userUpdate.last_name = data.last_name;
    if (data.phone !== undefined) userUpdate.phone = data.phone;

    let updatedUser = user;
    if (Object.keys(userUpdate).length > 0) {
      const result = await userRepository.update(userId, userUpdate);
      if (result) updatedUser = result;
    }

    const result: {
      user: Omit<User, 'password_hash'>;
      lawyer?: Lawyer;
    } = {
      user: sanitizeUser(updatedUser),
    };

    // Update lawyer-specific fields if user is a lawyer
    if (user.role === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (lawyer) {
        const lawyerUpdate: Partial<CreateLawyerData> = {};
        if (data.bar_number !== undefined) lawyerUpdate.bar_number = data.bar_number;
        if (data.specialization !== undefined) lawyerUpdate.specialization = data.specialization;
        if (data.is_available !== undefined) lawyerUpdate.is_available = data.is_available;
        if (data.max_cases !== undefined) lawyerUpdate.max_cases = data.max_cases;

        if (Object.keys(lawyerUpdate).length > 0) {
          const updatedLawyer = await lawyerRepository.update(lawyer.id, lawyerUpdate);
          if (updatedLawyer) result.lawyer = updatedLawyer;
        } else {
          result.lawyer = lawyer;
        }
      }
    }

    logger.info(`Profile updated for user: ${updatedUser.email}`);
    return result;
  },
};
