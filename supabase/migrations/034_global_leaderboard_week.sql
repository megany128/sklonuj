-- Global weekly leaderboard: aggregate in one round-trip.
--
-- Previously /api/leaderboard/global fetched every opted-in profile, then
-- queried practice_sessions with `.in('user_id', <every id>)`, then filtered
-- zero-score users in JS. This function does the join + week filter + sum in
-- Postgres and only returns users who actually practiced this week.

CREATE INDEX IF NOT EXISTS practice_sessions_session_date_user_idx
  ON public.practice_sessions (session_date, user_id);

CREATE OR REPLACE FUNCTION public.global_leaderboard_week(week_start date, week_end date)
RETURNS TABLE (user_id uuid, questions_attempted integer, questions_correct integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ps.user_id,
         sum(ps.questions_attempted)::integer AS questions_attempted,
         sum(ps.questions_correct)::integer AS questions_correct
  FROM public.practice_sessions ps
  JOIN public.profiles p ON p.id = ps.user_id AND p.show_on_leaderboard
  WHERE ps.session_date BETWEEN week_start AND week_end
  GROUP BY ps.user_id
  HAVING sum(ps.questions_attempted) > 0;
$$;

-- Exposes cross-user activity; only the service-role client (server-side,
-- after the endpoint has applied its own windowing) may call it.
REVOKE ALL ON FUNCTION public.global_leaderboard_week(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_leaderboard_week(date, date) TO service_role;
