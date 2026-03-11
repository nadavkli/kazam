-- Add daily_streak column to track consecutive daily claims separately from prediction streak
ALTER TABLE users ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0;