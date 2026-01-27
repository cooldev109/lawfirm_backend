import { query, queryOne } from '../config/database';
import { Document } from '../types';

export interface CreateDocumentData {
  case_id: string;
  uploaded_by: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  description?: string;
  is_confidential?: boolean;
}

export const documentRepository = {
  async findById(id: string): Promise<Document | null> {
    return queryOne<Document>('SELECT * FROM documents WHERE id = $1', [id]);
  },

  async findByCaseId(caseId: string): Promise<Document[]> {
    return query<Document>(
      'SELECT * FROM documents WHERE case_id = $1 ORDER BY created_at DESC',
      [caseId]
    );
  },

  async findByUploaderId(uploaderId: string): Promise<Document[]> {
    return query<Document>(
      'SELECT * FROM documents WHERE uploaded_by = $1 ORDER BY created_at DESC',
      [uploaderId]
    );
  },

  async create(data: CreateDocumentData): Promise<Document> {
    const result = await queryOne<Document>(
      `INSERT INTO documents (case_id, uploaded_by, filename, original_filename, mime_type, file_size, storage_path, description, is_confidential)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.case_id,
        data.uploaded_by,
        data.filename,
        data.original_filename,
        data.mime_type,
        data.file_size,
        data.storage_path,
        data.description,
        data.is_confidential || false,
      ]
    );
    return result!;
  },

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    return result.length > 0;
  },

  async countByCaseId(caseId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM documents WHERE case_id = $1',
      [caseId]
    );
    return parseInt(result?.count || '0', 10);
  },

  async getTotalSizeByCaseId(caseId: string): Promise<number> {
    const result = await queryOne<{ total: string }>(
      'SELECT COALESCE(SUM(file_size), 0) as total FROM documents WHERE case_id = $1',
      [caseId]
    );
    return parseInt(result?.total || '0', 10);
  },
};
