-- Add min_accuracy column to assignments table
ALTER TABLE public.assignments
ADD COLUMN min_accuracy integer
CHECK (min_accuracy IS NULL OR (min_accuracy >= 0 AND min_accuracy <= 100));
