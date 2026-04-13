-- Add per-case score tracking to practice_sessions for accuracy-over-time breakdowns
ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS case_scores jsonb DEFAULT '{}'::jsonb;
