import { query, queryOne, transaction } from '../config/database';
import { User, Client, Lawyer, UserRole } from '../types';

export interface CreateUserData {
  email: string;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone?: string;
}

export interface CreateClientData {
  user_id: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  notes?: string;
}

export interface CreateLawyerData {
  user_id: string;
  bar_number?: string;
  specialization?: string;
  is_available?: boolean;
  max_cases?: number;
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  },

  async findByEmail(email: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  },

  async findAll(role?: UserRole): Promise<User[]> {
    if (role) {
      return query<User>('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', [role]);
    }
    return query<User>('SELECT * FROM users ORDER BY created_at DESC');
  },

  async create(data: CreateUserData): Promise<User> {
    const result = await queryOne<User>(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.email.toLowerCase(), data.password_hash, data.role, data.first_name, data.last_name, data.phone]
    );
    return result!;
  },

  async update(id: string, data: Partial<CreateUserData>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(data.email.toLowerCase());
    }
    if (data.password_hash !== undefined) {
      fields.push(`password_hash = $${paramCount++}`);
      values.push(data.password_hash);
    }
    if (data.first_name !== undefined) {
      fields.push(`first_name = $${paramCount++}`);
      values.push(data.first_name);
    }
    if (data.last_name !== undefined) {
      fields.push(`last_name = $${paramCount++}`);
      values.push(data.last_name);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(data.phone);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return queryOne<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
  },

  async updateLastLogin(id: string): Promise<void> {
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  },

  async setActive(id: string, isActive: boolean): Promise<User | null> {
    return queryOne<User>(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING *',
      [isActive, id]
    );
  },

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return result.length > 0 || true; // DELETE doesn't return rows
  },
};

export const clientRepository = {
  async findById(id: string): Promise<Client | null> {
    return queryOne<Client>('SELECT * FROM clients WHERE id = $1', [id]);
  },

  async findByUserId(userId: string): Promise<Client | null> {
    return queryOne<Client>('SELECT * FROM clients WHERE user_id = $1', [userId]);
  },

  async findByEmail(email: string): Promise<(Client & { user: User }) | null> {
    return queryOne<Client & { user: User }>(
      `SELECT c.*, row_to_json(u.*) as user
       FROM clients c
       JOIN users u ON c.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );
  },

  async findAll(): Promise<(Client & { user: User })[]> {
    return query<Client & { user: User }>(
      `SELECT c.*, row_to_json(u.*) as user
       FROM clients c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC`
    );
  },

  async create(data: CreateClientData): Promise<Client> {
    const result = await queryOne<Client>(
      `INSERT INTO clients (user_id, company_name, address, city, state, zip_code, country, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.user_id, data.company_name, data.address, data.city, data.state, data.zip_code, data.country || 'USA', data.notes]
    );
    return result!;
  },

  async update(id: string, data: Partial<CreateClientData>): Promise<Client | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const updateableFields = ['company_name', 'address', 'city', 'state', 'zip_code', 'country', 'notes'] as const;
    for (const field of updateableFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${paramCount++}`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return queryOne<Client>(
      `UPDATE clients SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
  },

  async createWithUser(userData: CreateUserData, clientData: Omit<CreateClientData, 'user_id'>): Promise<{ user: User; client: Client }> {
    return transaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userData.email.toLowerCase(), userData.password_hash, userData.role, userData.first_name, userData.last_name, userData.phone]
      );
      const user = userResult.rows[0];

      const clientResult = await client.query(
        `INSERT INTO clients (user_id, company_name, address, city, state, zip_code, country, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [user.id, clientData.company_name, clientData.address, clientData.city, clientData.state, clientData.zip_code, clientData.country || 'USA', clientData.notes]
      );
      const clientRecord = clientResult.rows[0];

      return { user, client: clientRecord };
    });
  },
};

export const lawyerRepository = {
  async findById(id: string): Promise<Lawyer | null> {
    return queryOne<Lawyer>('SELECT * FROM lawyers WHERE id = $1', [id]);
  },

  async findByUserId(userId: string): Promise<Lawyer | null> {
    return queryOne<Lawyer>('SELECT * FROM lawyers WHERE user_id = $1', [userId]);
  },

  async findAll(availableOnly: boolean = false): Promise<(Lawyer & { user: User })[]> {
    let sql = `
      SELECT l.*, row_to_json(u.*) as user
      FROM lawyers l
      JOIN users u ON l.user_id = u.id
    `;
    if (availableOnly) {
      sql += ' WHERE l.is_available = true AND u.is_active = true';
    }
    sql += ' ORDER BY l.current_case_count ASC';
    return query<Lawyer & { user: User }>(sql);
  },

  async findAvailableForAssignment(): Promise<(Lawyer & { user: User }) | null> {
    return queryOne<Lawyer & { user: User }>(
      `SELECT l.*, row_to_json(u.*) as user
       FROM lawyers l
       JOIN users u ON l.user_id = u.id
       WHERE l.is_available = true
         AND u.is_active = true
         AND l.current_case_count < l.max_cases
       ORDER BY l.current_case_count ASC
       LIMIT 1`
    );
  },

  async create(data: CreateLawyerData): Promise<Lawyer> {
    const result = await queryOne<Lawyer>(
      `INSERT INTO lawyers (user_id, bar_number, specialization, is_available, max_cases)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.bar_number, data.specialization, data.is_available ?? true, data.max_cases ?? 50]
    );
    return result!;
  },

  async update(id: string, data: Partial<CreateLawyerData>): Promise<Lawyer | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const updateableFields = ['bar_number', 'specialization', 'is_available', 'max_cases'] as const;
    for (const field of updateableFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${paramCount++}`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return queryOne<Lawyer>(
      `UPDATE lawyers SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
  },

  async createWithUser(userData: CreateUserData, lawyerData: Omit<CreateLawyerData, 'user_id'>): Promise<{ user: User; lawyer: Lawyer }> {
    return transaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userData.email.toLowerCase(), userData.password_hash, userData.role, userData.first_name, userData.last_name, userData.phone]
      );
      const user = userResult.rows[0];

      const lawyerResult = await client.query(
        `INSERT INTO lawyers (user_id, bar_number, specialization, is_available, max_cases)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [user.id, lawyerData.bar_number, lawyerData.specialization, lawyerData.is_available ?? true, lawyerData.max_cases ?? 50]
      );
      const lawyer = lawyerResult.rows[0];

      return { user, lawyer };
    });
  },
};
