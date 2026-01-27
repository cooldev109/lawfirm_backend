-- Migration: Add inactivity tracking column to cases table
-- This column tracks when the last inactivity reminder was sent to prevent spam

ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_inactivity_notification TIMESTAMP;

-- Add index for efficient querying of inactive cases
CREATE INDEX IF NOT EXISTS idx_cases_last_activity_at ON cases(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_cases_last_inactivity_notification ON cases(last_inactivity_notification);

-- Add comment for documentation
COMMENT ON COLUMN cases.last_inactivity_notification IS 'Timestamp of the last inactivity reminder sent to the client';
