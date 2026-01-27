import { query, queryOne } from '../config/database';
import { userRepository, clientRepository, lawyerRepository } from '../repositories/userRepository';
import { caseRepository } from '../repositories/caseRepository';
import { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';

export interface SystemStats {
  totalUsers: number;
  totalClients: number;
  totalLawyers: number;
  totalCases: number;
  casesByStatus: Record<string, number>;
  recentCases: number;
  activeLawyers: number;
}

export interface UserWithDetails extends User {
  client?: {
    id: string;
    company_name?: string;
  };
  lawyer?: {
    id: string;
    specialization?: string;
    is_available: boolean;
    current_case_count: number;
  };
}

export const adminService = {
  async getSystemStats(): Promise<SystemStats> {
    // Get user counts
    const userCountResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM users'
    );
    const totalUsers = parseInt(userCountResult?.count || '0', 10);

    const clientCountResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM clients'
    );
    const totalClients = parseInt(clientCountResult?.count || '0', 10);

    const lawyerCountResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM lawyers'
    );
    const totalLawyers = parseInt(lawyerCountResult?.count || '0', 10);

    // Get active lawyers
    const activeLawyersResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM lawyers l
       JOIN users u ON l.user_id = u.id
       WHERE l.is_available = true AND u.is_active = true`
    );
    const activeLawyers = parseInt(activeLawyersResult?.count || '0', 10);

    // Get case stats
    const caseStats = await caseRepository.getStats({});

    // Get recent cases (last 7 days)
    const recentCasesResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM cases
       WHERE created_at > NOW() - INTERVAL '7 days'`
    );
    const recentCases = parseInt(recentCasesResult?.count || '0', 10);

    return {
      totalUsers,
      totalClients,
      totalLawyers,
      totalCases: caseStats.total,
      casesByStatus: caseStats.byStatus,
      recentCases,
      activeLawyers,
    };
  },

  async getAllUsers(role?: UserRole): Promise<UserWithDetails[]> {
    let sql = `
      SELECT
        u.*,
        c.id as client_id,
        c.company_name,
        l.id as lawyer_id,
        l.specialization,
        l.is_available,
        l.current_case_count
      FROM users u
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN lawyers l ON l.user_id = u.id
    `;

    const params: any[] = [];
    if (role) {
      sql += ' WHERE u.role = $1';
      params.push(role);
    }

    sql += ' ORDER BY u.created_at DESC';

    const results = await query<any>(sql, params);

    return results.map(row => ({
      id: row.id,
      email: row.email,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      client: row.client_id ? {
        id: row.client_id,
        company_name: row.company_name,
      } : undefined,
      lawyer: row.lawyer_id ? {
        id: row.lawyer_id,
        specialization: row.specialization,
        is_available: row.is_available,
        current_case_count: row.current_case_count,
      } : undefined,
    }));
  },

  async getUserById(id: string): Promise<UserWithDetails | null> {
    const sql = `
      SELECT
        u.*,
        c.id as client_id,
        c.company_name,
        l.id as lawyer_id,
        l.specialization,
        l.is_available,
        l.current_case_count
      FROM users u
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN lawyers l ON l.user_id = u.id
      WHERE u.id = $1
    `;

    const row = await queryOne<any>(sql, [id]);

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      client: row.client_id ? {
        id: row.client_id,
        company_name: row.company_name,
      } : undefined,
      lawyer: row.lawyer_id ? {
        id: row.lawyer_id,
        specialization: row.specialization,
        is_available: row.is_available,
        current_case_count: row.current_case_count,
      } : undefined,
    };
  },

  async toggleUserActive(id: string): Promise<User | null> {
    const user = await userRepository.findById(id);
    if (!user) return null;

    return userRepository.setActive(id, !user.is_active);
  },

  async createUser(data: {
    email: string;
    password: string;
    role: UserRole;
    first_name: string;
    last_name: string;
    phone?: string;
    // Lawyer-specific fields
    bar_number?: string;
    specialization?: string;
    max_cases?: number;
    // Client-specific fields
    company_name?: string;
  }): Promise<UserWithDetails> {
    const password_hash = await bcrypt.hash(data.password, 10);

    if (data.role === 'lawyer') {
      const result = await lawyerRepository.createWithUser(
        {
          email: data.email,
          password_hash,
          role: 'lawyer',
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        },
        {
          bar_number: data.bar_number,
          specialization: data.specialization,
          max_cases: data.max_cases,
          is_available: true,
        }
      );

      return {
        ...result.user,
        lawyer: {
          id: result.lawyer.id,
          specialization: result.lawyer.specialization,
          is_available: result.lawyer.is_available,
          current_case_count: result.lawyer.current_case_count,
        },
      };
    } else if (data.role === 'client') {
      const result = await clientRepository.createWithUser(
        {
          email: data.email,
          password_hash,
          role: 'client',
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        },
        {
          company_name: data.company_name,
        }
      );

      return {
        ...result.user,
        client: {
          id: result.client.id,
          company_name: result.client.company_name,
        },
      };
    } else {
      // Admin user
      const user = await userRepository.create({
        email: data.email,
        password_hash,
        role: 'admin',
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
      });

      return user;
    }
  },

  async updateUser(id: string, data: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  }): Promise<User | null> {
    return userRepository.update(id, data);
  },

  async getAllLawyers(): Promise<any[]> {
    const lawyers = await lawyerRepository.findAll();
    return lawyers.map(l => ({
      id: l.id,
      user_id: l.user_id,
      first_name: (l.user as any).first_name,
      last_name: (l.user as any).last_name,
      email: (l.user as any).email,
      phone: (l.user as any).phone,
      is_active: (l.user as any).is_active,
      bar_number: l.bar_number,
      specialization: l.specialization,
      is_available: l.is_available,
      max_cases: l.max_cases,
      current_case_count: l.current_case_count,
      hourly_rate: l.hourly_rate,
    }));
  },

  async updateLawyer(lawyerId: string, data: {
    bar_number?: string;
    specialization?: string;
    is_available?: boolean;
    max_cases?: number;
  }): Promise<any> {
    return lawyerRepository.update(lawyerId, data);
  },

  async canDeleteUser(userId: string): Promise<{ canDelete: boolean; reason?: string; activeCaseCount?: number }> {
    const user = await userRepository.findById(userId);
    if (!user) {
      return { canDelete: false, reason: 'User not found' };
    }

    // Check if user is a client with active cases
    if (user.role === 'client') {
      const result = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM cases c
         JOIN clients cl ON c.client_id = cl.id
         WHERE cl.user_id = $1 AND c.status != 'closed'`,
        [userId]
      );
      const activeCaseCount = parseInt(result?.count || '0', 10);
      if (activeCaseCount > 0) {
        return {
          canDelete: false,
          reason: `Cannot delete user. They have ${activeCaseCount} active case(s). Please close or reassign these cases first.`,
          activeCaseCount,
        };
      }
    }

    // Check if user is a lawyer with assigned active cases
    if (user.role === 'lawyer') {
      const result = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM cases c
         JOIN lawyers l ON c.lawyer_id = l.id
         WHERE l.user_id = $1 AND c.status NOT IN ('closed', 'resolved')`,
        [userId]
      );
      const activeCaseCount = parseInt(result?.count || '0', 10);
      if (activeCaseCount > 0) {
        return {
          canDelete: false,
          reason: `Cannot delete user. They have ${activeCaseCount} assigned case(s). Please reassign these cases first.`,
          activeCaseCount,
        };
      }
    }

    return { canDelete: true };
  },

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    // Check if user can be deleted
    const canDeleteResult = await this.canDeleteUser(userId);
    if (!canDeleteResult.canDelete) {
      return { success: false, error: canDeleteResult.reason };
    }

    // Delete the user (cascades will handle related records)
    const deleted = await userRepository.delete(userId);
    if (!deleted) {
      return { success: false, error: 'Failed to delete user' };
    }

    return { success: true };
  },

  async getAllCases(filters: {
    status?: string;
    lawyer_id?: string;
    client_id?: string;
  } = {}): Promise<any[]> {
    let sql = `
      SELECT
        c.*,
        u_client.first_name as client_first_name,
        u_client.last_name as client_last_name,
        u_client.email as client_email,
        u_lawyer.first_name as lawyer_first_name,
        u_lawyer.last_name as lawyer_last_name,
        u_lawyer.email as lawyer_email
      FROM cases c
      JOIN clients cl ON c.client_id = cl.id
      JOIN users u_client ON cl.user_id = u_client.id
      LEFT JOIN lawyers l ON c.lawyer_id = l.id
      LEFT JOIN users u_lawyer ON l.user_id = u_lawyer.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (filters.status) {
      sql += ` AND c.status = $${paramCount++}`;
      params.push(filters.status);
    }

    if (filters.lawyer_id) {
      sql += ` AND c.lawyer_id = $${paramCount++}`;
      params.push(filters.lawyer_id);
    }

    if (filters.client_id) {
      sql += ` AND c.client_id = $${paramCount++}`;
      params.push(filters.client_id);
    }

    sql += ' ORDER BY c.created_at DESC';

    return query<any>(sql, params);
  },
};
