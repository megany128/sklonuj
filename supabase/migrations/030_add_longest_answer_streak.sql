-- Add column for tracking the longest correct-in-a-row answer streak.
--
-- NOTE: this is distinct from the existing `longest_streak` column added by
-- migration 008, which tracks consecutive *practice days* (used by streak.ts).
-- This new column tracks the longest run of correct answers within / across
-- sessions, surfaced on the profile as an all-time stat.

alter table public.user_progress
	add column if not exists longest_answer_streak integer not null default 0;
