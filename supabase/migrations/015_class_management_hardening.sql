-- Migration: 015_class_management_hardening
-- Purpose: Defense-in-depth and data-integrity improvements for the class
--          management feature. Specifically, make the write-protection intent
--          on public.class_progress_snapshots explicit by adding deny-all
--          INSERT/UPDATE/DELETE RLS policies.
--
-- Snapshot writes are intended to come EXCLUSIVELY from the service-role
-- Supabase client used by the daily snapshot cron endpoint at
--   src/routes/api/cron/snapshots/+server.ts
-- The service role bypasses RLS, so these deny policies do not affect the
-- cron job. They exist to document intent and to ensure that no authenticated
-- end user (teacher or student) can ever directly insert, update, or delete
-- rows in class_progress_snapshots, even if a future migration accidentally
-- grants broader policies.

-- Drop first to keep this migration idempotent across re-runs.
DROP POLICY IF EXISTS "Deny direct inserts on class_progress_snapshots"
  ON public.class_progress_snapshots;
DROP POLICY IF EXISTS "Deny direct updates on class_progress_snapshots"
  ON public.class_progress_snapshots;
DROP POLICY IF EXISTS "Deny direct deletes on class_progress_snapshots"
  ON public.class_progress_snapshots;

CREATE POLICY "Deny direct inserts on class_progress_snapshots"
  ON public.class_progress_snapshots
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Deny direct updates on class_progress_snapshots"
  ON public.class_progress_snapshots
  FOR UPDATE
  USING (false);

CREATE POLICY "Deny direct deletes on class_progress_snapshots"
  ON public.class_progress_snapshots
  FOR DELETE
  USING (false);
