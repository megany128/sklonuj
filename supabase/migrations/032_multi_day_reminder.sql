-- Multi-day practice reminder preferences.
-- Replaces the single `reminder_day` smallint with a `reminder_days` smallint[]
-- so users can pick multiple days per week (same hour-of-day across all days).
-- `reminder_day` is kept for one release cycle as a fallback; a follow-up
-- migration will drop it.

ALTER TABLE public.profiles
  ADD COLUMN reminder_days smallint[] NOT NULL DEFAULT ARRAY[1]::smallint[]
    CHECK (
      array_length(reminder_days, 1) BETWEEN 1 AND 7
      AND reminder_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    );

-- Backfill from the existing single-day column so users keep their schedule.
UPDATE public.profiles
SET reminder_days = ARRAY[reminder_day]::smallint[]
WHERE reminder_day IS NOT NULL;
