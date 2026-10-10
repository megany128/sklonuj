-- Global weekly leaderboard: rank in SQL and return only the rows the banner shows.
--
-- global_leaderboard_week (migrations 034 / 037) returns one row per
-- participant, and the server then scored, sorted, ranked and windowed all of
-- them in JS on every home page load — linear in weekly participants. This
-- function does the same work in Postgres and returns at most seven rows: the
-- top three, the viewer with the row above and below them, and the single
-- row the JS used to add when exactly one rank sat between those two groups.
--
-- It reads the weekly totals through global_leaderboard_week, so the week
-- filter, the opt-out join and the guest union stay defined in one place. That
-- function is left as it is: the server still calls it when this one is not
-- installed yet.
--
-- Rules, identical to computeGlobalLeaderboard in
-- src/lib/server/global-leaderboard.ts:
--   * score = correct * 5 + (attempted - correct)
--   * order: score desc, then correct answers desc, then id (the id only
--     settles rows that are equal on both, which the JS left in arbitrary order)
--   * rank: competition rank on score alone (1, 1, 3), so tied scores share a rank
--   * the viewer is always a participant, at 0 points if they have not
--     practised this week, unless their profile has show_on_leaderboard = false.
--     Guests have no profile row, so a guest viewer is always included.
--
-- Every returned row carries total_users (participants this week, including a
-- 0-point viewer) and viewer_rank (NULL when there is no viewer or they opted
-- out). No rows at all means nobody is on the board.

CREATE OR REPLACE FUNCTION public.global_leaderboard_window(
  week_start date,
  week_end date,
  viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  questions_attempted integer,
  questions_correct integer,
  score integer,
  rank integer,
  board_position integer,
  total_users integer,
  viewer_rank integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH week AS (
    SELECT w.user_id, w.questions_attempted, w.questions_correct
    FROM public.global_leaderboard_week(
      global_leaderboard_window.week_start,
      global_leaderboard_window.week_end
    ) w
  ),
  participants AS (
    SELECT wk.user_id, wk.questions_attempted, wk.questions_correct
    FROM week wk
    UNION ALL
    SELECT global_leaderboard_window.viewer_id, 0, 0
    WHERE global_leaderboard_window.viewer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM week wk WHERE wk.user_id = global_leaderboard_window.viewer_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = global_leaderboard_window.viewer_id
          AND p.show_on_leaderboard = false
      )
  ),
  scored AS (
    SELECT pt.user_id,
           pt.questions_attempted,
           pt.questions_correct,
           (pt.questions_correct * 5 + (pt.questions_attempted - pt.questions_correct))::integer
             AS score
    FROM participants pt
  ),
  ranked AS (
    SELECT s.user_id,
           s.questions_attempted,
           s.questions_correct,
           s.score,
           rank() OVER (ORDER BY s.score DESC)::integer AS rnk,
           row_number() OVER (
             ORDER BY s.score DESC, s.questions_correct DESC, s.user_id
           )::integer AS pos,
           count(*) OVER ()::integer AS total_users
    FROM scored s
  ),
  me AS (
    SELECT r.pos, r.rnk
    FROM ranked r
    WHERE r.user_id = global_leaderboard_window.viewer_id
  ),
  -- Top three, plus the viewer and the row on either side of them.
  shown AS (
    SELECT r.pos, r.rnk
    FROM ranked r
    WHERE r.pos <= 3
       OR r.pos BETWEEN (SELECT me.pos FROM me) - 1 AND (SELECT me.pos FROM me) + 1
  ),
  -- Where two neighbouring shown rows are exactly two ranks apart, the rank in
  -- between is shown too, so the list has no one-row gap.
  gaps AS (
    SELECT g.rnk + 1 AS missing_rnk
    FROM (
      SELECT sh.rnk, lead(sh.rnk) OVER (ORDER BY sh.pos) AS next_rnk
      FROM shown sh
    ) g
    WHERE g.next_rnk - g.rnk = 2
  ),
  fillers AS (
    SELECT min(r.pos) AS pos
    FROM ranked r
    JOIN gaps ON gaps.missing_rnk = r.rnk
    GROUP BY r.rnk
  )
  SELECT r.user_id,
         r.questions_attempted,
         r.questions_correct,
         r.score,
         r.rnk AS rank,
         r.pos AS board_position,
         r.total_users,
         (SELECT me.rnk FROM me) AS viewer_rank
  FROM ranked r
  WHERE r.pos IN (SELECT sh.pos FROM shown sh)
     OR r.pos IN (SELECT f.pos FROM fillers f)
  ORDER BY r.pos;
$$;

-- Exposes cross-user activity; only the service-role client (server-side) may
-- call it, as with global_leaderboard_week.
REVOKE ALL ON FUNCTION public.global_leaderboard_window(date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_leaderboard_window(date, date, uuid) TO service_role;
