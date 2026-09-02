-- Teacher assignment wrap-up emails.
-- After an assignment's due date passes, a cron job sends the class teacher a
-- one-off summary email (completion count, average accuracy, struggling
-- students). `profiles.teacher_email_updates` is the teacher's opt-out flag;
-- `assignments.wrapup_sent` guards against duplicate sends.

ALTER TABLE public.profiles
ADD COLUMN teacher_email_updates boolean NOT NULL DEFAULT true;

ALTER TABLE public.assignments
ADD COLUMN wrapup_sent boolean NOT NULL DEFAULT false;

-- Backfill: mark every already-overdue assignment as sent so the first cron
-- run doesn't email teachers about long-past assignments.
UPDATE public.assignments
SET wrapup_sent = true
WHERE due_date IS NOT NULL AND due_date <= now();

-- Wrap-up cron: assignments whose wrap-up email is still pending.
CREATE INDEX IF NOT EXISTS idx_assignments_wrapup_pending
  ON public.assignments(due_date)
  WHERE wrapup_sent = false AND due_date IS NOT NULL;
