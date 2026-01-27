import { query, queryOne, transaction } from '../config/database';
import { Case, CaseStatus, CaseEvent, CaseEventType } from '../types';

export interface CreateCaseData {
  client_id: string;
  lawyer_id?: string;
  title: string;
  description?: string;
  case_type?: string;
  priority?: number;
}

export interface UpdateCaseData {
  lawyer_id?: string;
  title?: string;
  description?: string;
  status?: CaseStatus;
  case_type?: string;
  priority?: number;
}

export interface CaseFilters {
  client_id?: string;
  lawyer_id?: string;
  status?: CaseStatus | CaseStatus[];
  case_type?: string;
  search?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const caseRepository = {
  async findById(id: string): Promise<Case | null> {
    return queryOne<Case>('SELECT * FROM cases WHERE id = $1', [id]);
  },

  async findByCaseNumber(caseNumber: string): Promise<Case | null> {
    return queryOne<Case>('SELECT * FROM cases WHERE case_number = $1', [caseNumber]);
  },

  async findAll(filters: CaseFilters = {}, pagination: PaginationOptions = {}): Promise<{ cases: Case[]; total: number }> {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (filters.client_id) {
      whereClause += ` AND client_id = $${paramCount++}`;
      params.push(filters.client_id);
    }

    if (filters.lawyer_id) {
      whereClause += ` AND lawyer_id = $${paramCount++}`;
      params.push(filters.lawyer_id);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause += ` AND status = ANY($${paramCount++})`;
        params.push(filters.status);
      } else {
        whereClause += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }
    }

    if (filters.case_type) {
      whereClause += ` AND case_type = $${paramCount++}`;
      params.push(filters.case_type);
    }

    if (filters.search) {
      whereClause += ` AND (title ILIKE $${paramCount} OR case_number ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    const validSortColumns = ['created_at', 'updated_at', 'case_number', 'title', 'status', 'priority', 'last_activity_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM cases ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    params.push(limit, offset);
    const cases = await query<Case>(
      `SELECT * FROM cases ${whereClause} ORDER BY ${sortColumn} ${order} LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    return { cases, total };
  },

  async findByClientId(clientId: string): Promise<Case[]> {
    return query<Case>(
      'SELECT * FROM cases WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
  },

  async findByLawyerId(lawyerId: string): Promise<Case[]> {
    return query<Case>(
      'SELECT * FROM cases WHERE lawyer_id = $1 ORDER BY created_at DESC',
      [lawyerId]
    );
  },

  async findInactiveCases(daysThreshold: number): Promise<Case[]> {
    return query<Case>(
      `SELECT * FROM cases
       WHERE status NOT IN ('closed', 'archived', 'resolved')
       AND last_activity_at < NOW() - INTERVAL '1 day' * $1
       ORDER BY last_activity_at ASC`,
      [daysThreshold]
    );
  },

  async create(data: CreateCaseData): Promise<Case> {
    const result = await queryOne<Case>(
      `INSERT INTO cases (case_number, client_id, lawyer_id, title, description, case_type, priority)
       VALUES (generate_case_number(), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.client_id, data.lawyer_id, data.title, data.description, data.case_type, data.priority || 3]
    );
    return result!;
  },

  async update(id: string, data: UpdateCaseData): Promise<Case | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.lawyer_id !== undefined) {
      fields.push(`lawyer_id = $${paramCount++}`);
      values.push(data.lawyer_id);
    }
    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
      if (data.status === CaseStatus.CLOSED || data.status === CaseStatus.ARCHIVED) {
        fields.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (data.case_type !== undefined) {
      fields.push(`case_type = $${paramCount++}`);
      values.push(data.case_type);
    }
    if (data.priority !== undefined) {
      fields.push(`priority = $${paramCount++}`);
      values.push(data.priority);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return queryOne<Case>(
      `UPDATE cases SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
  },

  async updateStatus(id: string, status: CaseStatus): Promise<Case | null> {
    return this.update(id, { status });
  },

  async assignLawyer(id: string, lawyerId: string): Promise<Case | null> {
    return this.update(id, { lawyer_id: lawyerId });
  },

  async createWithEvent(data: CreateCaseData, actorId?: string): Promise<Case> {
    return transaction(async (client) => {
      const caseResult = await client.query(
        `INSERT INTO cases (case_number, client_id, lawyer_id, title, description, case_type, priority)
         VALUES (generate_case_number(), $1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [data.client_id, data.lawyer_id, data.title, data.description, data.case_type, data.priority || 3]
      );
      const newCase = caseResult.rows[0];

      await client.query(
        `INSERT INTO case_events (case_id, event_type, actor_id, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          newCase.id,
          CaseEventType.CASE_CREATED,
          actorId,
          `Case created: ${newCase.title}`,
          JSON.stringify({ case_number: newCase.case_number, title: newCase.title }),
        ]
      );

      return newCase;
    });
  },

  async getStats(filters: CaseFilters = {}): Promise<{ total: number; byStatus: Record<string, number> }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (filters.client_id) {
      whereClause += ` AND client_id = $${paramCount++}`;
      params.push(filters.client_id);
    }

    if (filters.lawyer_id) {
      whereClause += ` AND lawyer_id = $${paramCount++}`;
      params.push(filters.lawyer_id);
    }

    // Get total count
    const totalResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM cases ${whereClause}`,
      params
    );
    const total = parseInt(totalResult?.count || '0', 10);

    // Get count by status
    const statusResults = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM cases ${whereClause} GROUP BY status`,
      params
    );

    const byStatus: Record<string, number> = {};
    for (const row of statusResults) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    return { total, byStatus };
  },
};

export const caseEventRepository = {
  async findByCaseId(caseId: string): Promise<CaseEvent[]> {
    return query<CaseEvent>(
      'SELECT * FROM case_events WHERE case_id = $1 ORDER BY created_at DESC',
      [caseId]
    );
  },

  async create(data: {
    case_id: string;
    event_type: CaseEventType;
    actor_id?: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<CaseEvent> {
    const result = await queryOne<CaseEvent>(
      `INSERT INTO case_events (case_id, event_type, actor_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.case_id, data.event_type, data.actor_id, data.description, JSON.stringify(data.metadata || {})]
    );
    return result!;
  },

  async getTimeline(caseId: string, limit: number = 50): Promise<CaseEvent[]> {
    return query<CaseEvent>(
      `SELECT ce.*, u.first_name, u.last_name, u.email as actor_email
       FROM case_events ce
       LEFT JOIN users u ON ce.actor_id = u.id
       WHERE ce.case_id = $1
       ORDER BY ce.created_at DESC
       LIMIT $2`,
      [caseId, limit]
    );
  },
};
