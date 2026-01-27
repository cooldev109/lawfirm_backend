-- Migration: 001_initial_schema
-- Description: Create initial database schema for lawyer system
-- Date: 2024

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'lawyer', 'client');
CREATE TYPE case_status AS ENUM (
  'new',
  'in_review',
  'active',
  'pending_client',
  'pending_documents',
  'in_progress',
  'awaiting_response',
  'resolved',
  'closed',
  'archived'
);
CREATE TYPE case_event_type AS ENUM (
  'case_created',
  'case_updated',
  'status_changed',
  'document_uploaded',
  'document_downloaded',
  'email_received',
  'email_sent',
  'lawyer_assigned',
  'lawyer_note_added',
  'client_notified',
  'inactivity_alert'
);
CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed', 'delivered');

-- Case number sequence (format: CASE-2024-00001)
CREATE SEQUENCE case_number_seq START 1;

-- Users table (base for all user types)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Clients table (extends users)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  address VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clients_user_id ON clients(user_id);

-- Lawyers table (extends users)
CREATE TABLE lawyers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bar_number VARCHAR(50),
  specialization VARCHAR(255),
  is_available BOOLEAN DEFAULT true,
  max_cases INTEGER DEFAULT 50,
  current_case_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lawyers_user_id ON lawyers(user_id);
CREATE INDEX idx_lawyers_available ON lawyers(is_available);

-- Cases table
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number VARCHAR(20) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  lawyer_id UUID REFERENCES lawyers(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status case_status DEFAULT 'new',
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  case_type VARCHAR(100),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cases_case_number ON cases(case_number);
CREATE INDEX idx_cases_client_id ON cases(client_id);
CREATE INDEX idx_cases_lawyer_id ON cases(lawyer_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_last_activity ON cases(last_activity_at);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  description TEXT,
  is_confidential BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_case_id ON documents(case_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- Emails table
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  direction email_direction NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  cc_addresses TEXT[],
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,
  status email_status DEFAULT 'pending',
  message_id VARCHAR(255),
  in_reply_to VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_emails_case_id ON emails(case_id);
CREATE INDEX idx_emails_client_id ON emails(client_id);
CREATE INDEX idx_emails_direction ON emails(direction);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_from_address ON emails(from_address);
CREATE INDEX idx_emails_message_id ON emails(message_id);

-- Case events table (audit trail / timeline)
CREATE TABLE case_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type case_event_type NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_case_events_case_id ON case_events(case_id);
CREATE INDEX idx_case_events_event_type ON case_events(event_type);
CREATE INDEX idx_case_events_created_at ON case_events(created_at);

-- Email templates table
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lawyer assignment rules (for automatic assignment)
CREATE TABLE assignment_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  case_type VARCHAR(100),
  priority_min INTEGER,
  priority_max INTEGER,
  lawyer_id UUID REFERENCES lawyers(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignment_rules_case_type ON assignment_rules(case_type);
CREATE INDEX idx_assignment_rules_lawyer_id ON assignment_rules(lawyer_id);

-- Refresh tokens table (for JWT refresh)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- Function to generate case number
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  seq_val INTEGER;
  year_part VARCHAR(4);
BEGIN
  seq_val := nextval('case_number_seq');
  year_part := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'CASE-' || year_part || '-' || lpad(seq_val::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lawyers_updated_at BEFORE UPDATE ON lawyers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update case last_activity_at when events are added
CREATE OR REPLACE FUNCTION update_case_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cases SET last_activity_at = CURRENT_TIMESTAMP WHERE id = NEW.case_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_case_activity_on_event AFTER INSERT ON case_events
  FOR EACH ROW EXECUTE FUNCTION update_case_last_activity();

-- Function to update lawyer case count
CREATE OR REPLACE FUNCTION update_lawyer_case_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.lawyer_id IS NOT NULL THEN
      UPDATE lawyers SET current_case_count = (
        SELECT COUNT(*) FROM cases
        WHERE lawyer_id = NEW.lawyer_id
        AND status NOT IN ('closed', 'archived')
      ) WHERE id = NEW.lawyer_id;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.lawyer_id IS NOT NULL AND OLD.lawyer_id != NEW.lawyer_id THEN
      UPDATE lawyers SET current_case_count = (
        SELECT COUNT(*) FROM cases
        WHERE lawyer_id = OLD.lawyer_id
        AND status NOT IN ('closed', 'archived')
      ) WHERE id = OLD.lawyer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lawyer_count_on_case_change AFTER INSERT OR UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_lawyer_case_count();
