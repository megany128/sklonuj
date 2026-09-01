-- Query-shaped indexes + one redundant-index drop.
--
-- Every statement is idempotent (IF NOT EXISTS / IF EXISTS) so this file is
-- safe to re-run. Predicates below are copied from the PostgREST calls they
-- serve; keep them in lock-step if those queries change.

-- Weekly-summary cron eligibility scan
-- (src/routes/api/cron/weekly-summary/+server.ts:208-214):
--   profiles WHERE email_reminders = true
--            AND reminder_days @> ARRAY[<utc_dow>]   -- .contains() / PostgREST `cs`
--            AND reminder_hour_utc <= <utc_hour>
--            AND (last_weekly_email_at IS NULL OR last_weekly_email_at < <cutoff>)
-- The array-containment predicate is the selective one (default is ARRAY[1],
-- so a given weekday matches roughly 1/7 of rows). `reminder_hour_utc <=`
-- matches most rows late in the UTC day and the cooldown clause matches every
-- row not emailed in the last 20h, so neither earns a btree of its own.
-- GIN (default array_ops) is the access method that serves `@>`; partial on
-- email_reminders so opted-out users never enter the index at all.
CREATE INDEX IF NOT EXISTS profiles_reminder_days_idx
  ON public.profiles USING gin (reminder_days)
  WHERE email_reminders = true;

-- Redundant: assignment_progress(assignment_id) from 005:92.
-- 005:89 declares UNIQUE(assignment_id, student_id), whose backing btree
-- (assignment_progress_assignment_id_student_id_key) has assignment_id as its
-- LEADING column. Every consumer of the single-column index — the reminder
-- cron's `eq(assignment_id) + in(student_id)` lookup
-- (src/routes/api/cron/reminders/+server.ts:76-80) and the FK cascade from
-- assignments — is served at least as well by the unique index, so the extra
-- one only costs a btree write on every progress upsert.
-- (Column order verified: it is (assignment_id, student_id), not
-- (student_id, assignment_id); had it been the latter this drop would be wrong.)
DROP INDEX IF EXISTS public.idx_assignment_progress_assignment_id;

-- Deliberately NOT added:
--   * assignment_progress(updated_at) — its only consumer is being removed.
--   * Anything for src/routes/+layout.server.ts — every filter there is either
--     a primary-key lookup (user_progress.user_id, profiles.id) or already
--     backed by 005 (class_memberships.student_id, assignments.class_id,
--     assignment_progress.student_id).
--   * Anything further for the reminder cron — the due_date windows use the
--     014 partial indexes, class_memberships(class_id) is backed by 005:43,
--     and the same leading-column argument makes 005:43 redundant with
--     UNIQUE(class_id, student_id) at 005:40; left in place for a separate,
--     deliberate cleanup rather than piggy-backed here.
--   * weekly-summary's practice_sessions read (:252-256, `in(user_id)` +
--     `gte(session_date)`) is already exactly the shape of
--     UNIQUE(user_id, session_date) from 002:10.
