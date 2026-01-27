import { query } from '../config/database';
import { lawyerRepository } from '../repositories/userRepository';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { UserRole } from '../types';

export interface ClientWithCaseInfo {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  total_cases: number;
  active_cases: number;
  last_activity_at?: string;
}

export const lawyerService = {
  async getClientsForLawyer(
    userId: string,
    userRole: UserRole
  ): Promise<ClientWithCaseInfo[]> {
    // Admin can see all clients
    if (userRole === UserRole.ADMIN) {
      return this.getAllClientsWithCaseInfo();
    }

    // Lawyers can only see their assigned clients
    if (userRole === UserRole.LAWYER) {
      const lawyer = await lawyerRepository.findByUserId(userId);
      if (!lawyer) {
        throw new NotFoundError('Lawyer profile not found');
      }
      return this.getClientsByLawyerId(lawyer.id);
    }

    throw new ForbiddenError('Access denied');
  },

  async getClientsByLawyerId(lawyerId: string): Promise<ClientWithCaseInfo[]> {
    const sql = `
      SELECT DISTINCT
        cl.id,
        cl.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        cl.company_name,
        cl.address,
        cl.city,
        cl.state,
        cl.zip_code,
        COUNT(c.id) as total_cases,
        COUNT(CASE WHEN c.status NOT IN ('closed', 'archived') THEN 1 END) as active_cases,
        MAX(c.last_activity_at) as last_activity_at
      FROM clients cl
      JOIN users u ON cl.user_id = u.id
      JOIN cases c ON c.client_id = cl.id
      WHERE c.lawyer_id = $1
      GROUP BY cl.id, cl.user_id, u.first_name, u.last_name, u.email, u.phone,
               cl.company_name, cl.address, cl.city, cl.state, cl.zip_code
      ORDER BY MAX(c.last_activity_at) DESC
    `;

    const results = await query<any>(sql, [lawyerId]);

    return results.map(row => ({
      id: row.id,
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      company_name: row.company_name,
      address: row.address,
      city: row.city,
      state: row.state,
      zip_code: row.zip_code,
      total_cases: parseInt(row.total_cases, 10),
      active_cases: parseInt(row.active_cases, 10),
      last_activity_at: row.last_activity_at,
    }));
  },

  async getAllClientsWithCaseInfo(): Promise<ClientWithCaseInfo[]> {
    const sql = `
      SELECT
        cl.id,
        cl.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        cl.company_name,
        cl.address,
        cl.city,
        cl.state,
        cl.zip_code,
        COUNT(c.id) as total_cases,
        COUNT(CASE WHEN c.status NOT IN ('closed', 'archived') THEN 1 END) as active_cases,
        MAX(c.last_activity_at) as last_activity_at
      FROM clients cl
      JOIN users u ON cl.user_id = u.id
      LEFT JOIN cases c ON c.client_id = cl.id
      GROUP BY cl.id, cl.user_id, u.first_name, u.last_name, u.email, u.phone,
               cl.company_name, cl.address, cl.city, cl.state, cl.zip_code
      ORDER BY MAX(c.last_activity_at) DESC NULLS LAST
    `;

    const results = await query<any>(sql);

    return results.map(row => ({
      id: row.id,
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      company_name: row.company_name,
      address: row.address,
      city: row.city,
      state: row.state,
      zip_code: row.zip_code,
      total_cases: parseInt(row.total_cases || '0', 10),
      active_cases: parseInt(row.active_cases || '0', 10),
      last_activity_at: row.last_activity_at,
    }));
  },

  async getClientById(clientId: string): Promise<ClientWithCaseInfo | null> {
    const sql = `
      SELECT
        cl.id,
        cl.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        cl.company_name,
        cl.address,
        cl.city,
        cl.state,
        cl.zip_code,
        COUNT(c.id) as total_cases,
        COUNT(CASE WHEN c.status NOT IN ('closed', 'archived') THEN 1 END) as active_cases,
        MAX(c.last_activity_at) as last_activity_at
      FROM clients cl
      JOIN users u ON cl.user_id = u.id
      LEFT JOIN cases c ON c.client_id = cl.id
      WHERE cl.id = $1
      GROUP BY cl.id, cl.user_id, u.first_name, u.last_name, u.email, u.phone,
               cl.company_name, cl.address, cl.city, cl.state, cl.zip_code
    `;

    const results = await query<any>(sql, [clientId]);
    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      company_name: row.company_name,
      address: row.address,
      city: row.city,
      state: row.state,
      zip_code: row.zip_code,
      total_cases: parseInt(row.total_cases || '0', 10),
      active_cases: parseInt(row.active_cases || '0', 10),
      last_activity_at: row.last_activity_at,
    };
  },
};
