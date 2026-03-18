-- Add B2 to the allowed level values in user_progress
ALTER TABLE public.user_progress
  DROP CONSTRAINT IF EXISTS user_progress_level_check;

ALTER TABLE public.user_progress
  ADD CONSTRAINT user_progress_level_check CHECK (level IN ('A1', 'A2', 'B1', 'B2'));
