-- Add a JSONB column to store per-case scores on each assignment attempt
ALTER TABLE public.assignment_progress
  ADD COLUMN IF NOT EXISTS case_scores jsonb DEFAULT '{}'::jsonb;
