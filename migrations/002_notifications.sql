-- Migration: 002_notifications
-- Description: Add notifications table for in-app alerts
-- Date: 2026-01-25

-- Create notification type enum
CREATE TYPE notification_type AS ENUM (
  'new_case',
  'case_update',
  'document_uploaded',
  'message_received',
  'case_assigned',
  'deadline_reminder',
  'system_alert'
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient querying
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
