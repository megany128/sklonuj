-- Add day/time preferences for weekly practice reminder emails.
-- reminder_day: 0 = Sunday, 1 = Monday, …, 6 = Saturday (stored in UTC).
-- reminder_hour_utc: 0–23 hour in UTC when the email should be sent.
-- last_weekly_email_at: prevents duplicate sends within the same week.

-- Change email_reminders default to true so new users (including OAuth) are
-- opted in automatically. Existing users keep their current value.
ALTER TABLE public.profiles ALTER COLUMN email_reminders SET DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN reminder_day smallint NOT NULL DEFAULT 1
    CHECK (reminder_day BETWEEN 0 AND 6),
  ADD COLUMN reminder_hour_utc smallint NOT NULL DEFAULT 14
    CHECK (reminder_hour_utc BETWEEN 0 AND 23),
  ADD COLUMN last_weekly_email_at timestamptz;
