-- Add a JSONB column to store recent mistakes for review
ALTER TABLE public.assignment_progress
  ADD COLUMN IF NOT EXISTS mistakes jsonb DEFAULT '[]'::jsonb;
