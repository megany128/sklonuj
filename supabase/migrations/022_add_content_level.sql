-- Add content_level column to assignments table
-- This stores the CEFR level (A1, A2, B1) or KZK chapter (kzk1_01, kzk2_03, etc.)
-- that constrains the vocabulary used in the assignment.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS content_level TEXT DEFAULT NULL;
