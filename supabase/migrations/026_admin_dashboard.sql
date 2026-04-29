-- Admin dashboard: gives the developer a UI to triage content_reports and
-- audit content. Admins are flagged via profiles.is_admin (read by the
-- authenticated user themselves under the existing "Users read own profile"
-- policy — no extra RLS needed).
--
-- Manual bootstrap: after applying this migration, run
--   UPDATE public.profiles SET is_admin = true WHERE id = '<your-user-id>';
-- in the Supabase SQL editor for the dev account.

ALTER TABLE public.profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Content report triage state. The dashboard mutates these via a service-role
-- server endpoint (mirroring how /api/report inserts), so no client policies
-- are added — content_reports remains server-only.
ALTER TABLE public.content_reports
  ADD COLUMN status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed', 'in_progress')),
  ADD COLUMN admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 4000),
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for the default dashboard view (open reports, newest first).
CREATE INDEX content_reports_status_created_at_idx
  ON public.content_reports (status, created_at DESC);
