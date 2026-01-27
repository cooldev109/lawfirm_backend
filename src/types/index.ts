export enum UserRole {
  ADMIN = 'admin',
  LAWYER = 'lawyer',
  CLIENT = 'client',
}

export enum CaseStatus {
  NEW = 'new',
  IN_REVIEW = 'in_review',
  ACTIVE = 'active',
  PENDING_CLIENT = 'pending_client',
  PENDING_DOCUMENTS = 'pending_documents',
  IN_PROGRESS = 'in_progress',
  AWAITING_RESPONSE = 'awaiting_response',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum CaseType {
  PERSONAL_INJURY = 'personal_injury',
  FAMILY_LAW = 'family_law',
  CRIMINAL_DEFENSE = 'criminal_defense',
  ESTATE_PLANNING = 'estate_planning',
  BUSINESS_LAW = 'business_law',
  REAL_ESTATE = 'real_estate',
  IMMIGRATION = 'immigration',
  BANKRUPTCY = 'bankruptcy',
  EMPLOYMENT = 'employment',
  OTHER = 'other',
}

export enum CaseEventType {
  CASE_CREATED = 'case_created',
  CASE_UPDATED = 'case_updated',
  STATUS_CHANGED = 'status_changed',
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_DOWNLOADED = 'document_downloaded',
  EMAIL_RECEIVED = 'email_received',
  EMAIL_SENT = 'email_sent',
  LAWYER_ASSIGNED = 'lawyer_assigned',
  LAWYER_NOTE_ADDED = 'lawyer_note_added',
  CLIENT_NOTIFIED = 'client_notified',
  INACTIVITY_ALERT = 'inactivity_alert',
  PENDING = 'pending',
  MESSAGE_SENT = 'message_sent',
}

export enum EmailDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Client {
  id: string;
  user_id: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Lawyer {
  id: string;
  user_id: string;
  bar_number?: string;
  specialization?: string;
  is_available: boolean;
  max_cases?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Case {
  id: string;
  case_number: string;
  client_id: string;
  lawyer_id?: string;
  title: string;
  description?: string;
  status: CaseStatus;
  priority: number;
  case_type?: string;
  opened_at: Date;
  closed_at?: Date;
  last_activity_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  case_id: string;
  uploaded_by: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  description?: string;
  is_confidential: boolean;
  created_at: Date;
}

export interface Email {
  id: string;
  case_id?: string;
  client_id?: string;
  direction: EmailDirection;
  from_address: string;
  to_address: string;
  cc_addresses?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  status: EmailStatus;
  message_id?: string;
  in_reply_to?: string;
  sent_at?: Date;
  received_at?: Date;
  processed_at?: Date;
  error_message?: string;
  created_at: Date;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: CaseEventType;
  actor_id?: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface Message {
  id: string;
  case_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  read_at?: Date;
  created_at: Date;
}

export interface MessageWithSender extends Message {
  sender_first_name: string;
  sender_last_name: string;
  sender_role: UserRole;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_text: string;
  body_html?: string;
  variables: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
