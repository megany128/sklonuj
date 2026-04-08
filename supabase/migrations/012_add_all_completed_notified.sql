-- Add a flag to prevent duplicate teacher notification emails
-- when all students in a class have completed an assignment
ALTER TABLE public.assignments
  ADD COLUMN all_completed_notified boolean NOT NULL DEFAULT false;
