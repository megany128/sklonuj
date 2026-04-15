-- Add include_adjectives column to assignments table
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS include_adjectives BOOLEAN NOT NULL DEFAULT false;
