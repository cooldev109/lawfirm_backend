import { query, queryOne } from '../config/database';
import { Message, MessageWithSender } from '../types';

export interface CreateMessageData {
  case_id: string;
  sender_id: string;
  content: string;
}

export const messageRepository = {
  async findById(id: string): Promise<Message | null> {
    return queryOne<Message>('SELECT * FROM messages WHERE id = $1', [id]);
  },

  async findByIdWithSender(id: string): Promise<MessageWithSender | null> {
    return queryOne<MessageWithSender>(
      `SELECT m.*,
              u.first_name as sender_first_name,
              u.last_name as sender_last_name,
              u.role as sender_role
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = $1`,
      [id]
    );
  },

  async findByCaseId(caseId: string): Promise<MessageWithSender[]> {
    return query<MessageWithSender>(
      `SELECT m.*,
              u.first_name as sender_first_name,
              u.last_name as sender_last_name,
              u.role as sender_role
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.case_id = $1
       ORDER BY m.created_at ASC`,
      [caseId]
    );
  },

  async create(data: CreateMessageData): Promise<Message> {
    const result = await queryOne<Message>(
      `INSERT INTO messages (case_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.case_id, data.sender_id, data.content]
    );
    return result!;
  },

  async markAsRead(messageId: string): Promise<Message | null> {
    return queryOne<Message>(
      `UPDATE messages
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [messageId]
    );
  },

  async markAllAsReadForCase(caseId: string, recipientId: string): Promise<number> {
    const result = await query<{ id: string }>(
      `UPDATE messages
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE case_id = $1 AND sender_id != $2 AND is_read = false
       RETURNING id`,
      [caseId, recipientId]
    );
    return result.length;
  },

  async getUnreadCountForCase(caseId: string, userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM messages
       WHERE case_id = $1 AND sender_id != $2 AND is_read = false`,
      [caseId, userId]
    );
    return parseInt(result?.count || '0', 10);
  },

  async getUnreadCountForUser(userId: string, caseIds: string[]): Promise<number> {
    if (caseIds.length === 0) return 0;

    const placeholders = caseIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM messages
       WHERE case_id IN (${placeholders}) AND sender_id != $1 AND is_read = false`,
      [userId, ...caseIds]
    );
    return parseInt(result?.count || '0', 10);
  },

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM messages WHERE id = $1 RETURNING id', [id]);
    return result.length > 0;
  },
};
