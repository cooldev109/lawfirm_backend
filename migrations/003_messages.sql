-- Migration: 003_messages
-- Description: Add messages table for case-related messaging between clients and lawyers
-- Date: 2026-01-25

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_messages_case_id ON messages(case_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(case_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages(case_id, is_read) WHERE is_read = false;

-- Add message_sent event type to case_event_type enum
ALTER TYPE case_event_type ADD VALUE IF NOT EXISTS 'message_sent';

-- Trigger to update case last_activity when message is sent
CREATE TRIGGER update_case_activity_on_message AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_case_last_activity();
