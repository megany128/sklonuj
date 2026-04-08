-- Class management hot-path indexes.
-- Adds partial/composite indexes for leaderboard reaction reads, reaction
-- uniqueness checks, the 1-day and 3-day assignment reminder cron jobs, and
-- the active-class snapshot cron job.

-- Leaderboard: unread reactions for a recipient in a given class/week.
CREATE INDEX IF NOT EXISTS idx_leaderboard_reactions_to_class_week_unread
  ON public.leaderboard_reactions(to_user_id, class_id, week_start)
  WHERE read = false;

-- Leaderboard: fast uniqueness check when sending a reaction.
CREATE INDEX IF NOT EXISTS idx_leaderboard_reactions_sent_check
  ON public.leaderboard_reactions(class_id, from_user_id, to_user_id, sent_date);

-- Reminder cron: assignments needing the 3-day reminder.
CREATE INDEX IF NOT EXISTS idx_assignments_3day_reminder
  ON public.assignments(due_date)
  WHERE reminder_3day_sent = false AND due_date IS NOT NULL;

-- Reminder cron: assignments needing the 1-day reminder.
CREATE INDEX IF NOT EXISTS idx_assignments_1day_reminder
  ON public.assignments(due_date)
  WHERE reminder_sent = false AND due_date IS NOT NULL;

-- Snapshot cron: active (non-archived) classes.
CREATE INDEX IF NOT EXISTS idx_classes_active
  ON public.classes(id)
  WHERE archived = false;
