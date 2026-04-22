-- Add opt-in flag for global leaderboard visibility
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean NOT NULL DEFAULT true;
