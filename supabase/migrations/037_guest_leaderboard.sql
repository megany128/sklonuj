-- Anonymous (guest) users on the global weekly leaderboard.
--
-- Guests have no auth.users row, so their per-day practice totals live in a
-- separate table keyed by a client-generated UUID (localStorage
-- `sklonuj_guest_id`, mirrored into a cookie so SSR can window the board
-- around the viewer). Rows are written only through the service-role client
-- in /api/leaderboard/guest (RLS on, no client policies — same pattern as
-- `content_reports`) and deleted when the guest signs up and their sessions
-- are uploaded to `practice_sessions`, so nobody is counted twice.

CREATE TABLE public.guest_practice_sessions (
  guest_id uuid NOT NULL,
  session_date date NOT NULL,
  questions_attempted integer NOT NULL DEFAULT 0 CHECK (questions_attempted >= 0),
  questions_correct integer NOT NULL DEFAULT 0
    CHECK (questions_correct >= 0 AND questions_correct <= questions_attempted),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, session_date)
);

-- Week-window scans in global_leaderboard_week and the prune function.
CREATE INDEX guest_practice_sessions_session_date_idx
  ON public.guest_practice_sessions (session_date, guest_id);

ALTER TABLE public.guest_practice_sessions ENABLE ROW LEVEL SECURITY;

-- Per-field MAX merge, mirroring /api/sync for signed-in users: the client
-- sends cumulative totals for the day, so a stale or out-of-order request can
-- never shrink a row. Both counters come from the same localStorage record
-- (correct <= attempted on every write), so GREATEST keeps the CHECK valid.
CREATE OR REPLACE FUNCTION public.upsert_guest_practice_session(
  p_guest_id uuid,
  p_session_date date,
  p_attempted integer,
  p_correct integer
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.guest_practice_sessions
    (guest_id, session_date, questions_attempted, questions_correct)
  VALUES (p_guest_id, p_session_date, p_attempted, p_correct)
  ON CONFLICT (guest_id, session_date) DO UPDATE SET
    questions_attempted = GREATEST(guest_practice_sessions.questions_attempted, EXCLUDED.questions_attempted),
    questions_correct = GREATEST(guest_practice_sessions.questions_correct, EXCLUDED.questions_correct),
    updated_at = now();
$$;

-- Guest rows only feed the Monday–Sunday board, so once a week rolls over
-- everything dated before the current week's Monday is dead weight (a guest
-- who signs up has their rows deleted anyway). date_trunc('week') is
-- ISO/Monday-based, matching getCurrentWeekMonday() on the server. Called
-- from the 6-hourly snapshots cron, so pruning lands within hours of Monday.
CREATE OR REPLACE FUNCTION public.prune_guest_practice_sessions()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.guest_practice_sessions
    WHERE session_date < date_trunc('week', current_date)::date
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;

-- Same signature and return shape as migration 034; guests are unioned in
-- under their guest_id. Guests have no profile row and no opt-out toggle,
-- so they are always included.
CREATE OR REPLACE FUNCTION public.global_leaderboard_week(week_start date, week_end date)
RETURNS TABLE (user_id uuid, questions_attempted integer, questions_correct integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.user_id,
         sum(s.questions_attempted)::integer AS questions_attempted,
         sum(s.questions_correct)::integer AS questions_correct
  FROM (
    SELECT ps.user_id, ps.questions_attempted, ps.questions_correct
    FROM public.practice_sessions ps
    JOIN public.profiles p ON p.id = ps.user_id AND p.show_on_leaderboard
    WHERE ps.session_date BETWEEN week_start AND week_end
    UNION ALL
    SELECT gs.guest_id AS user_id, gs.questions_attempted, gs.questions_correct
    FROM public.guest_practice_sessions gs
    WHERE gs.session_date BETWEEN week_start AND week_end
  ) s
  GROUP BY s.user_id
  HAVING sum(s.questions_attempted) > 0;
$$;

-- All three expose or mutate cross-user data; only the service-role client
-- (server-side, after validation / windowing) may call them.
REVOKE ALL ON FUNCTION public.upsert_guest_practice_session(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_guest_practice_session(uuid, date, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.prune_guest_practice_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_guest_practice_sessions() TO service_role;
REVOKE ALL ON FUNCTION public.global_leaderboard_week(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_leaderboard_week(date, date) TO service_role;
