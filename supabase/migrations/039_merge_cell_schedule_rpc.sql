-- Atomic per-cell merge of a client's spacing schedule into
-- user_progress.cell_schedule. /api/sync and the login merge used to read the
-- stored schedule, merge it in JS and write the whole column back; two tabs
-- or devices doing that at once lost whichever write landed first. This runs
-- the same merge under a row lock (SELECT ... FOR UPDATE), so concurrent
-- calls serialise and every cell keeps its most recent attempt.
--
-- Mirrors src/lib/engine/spacing.ts: per cell the greater `last` wins (the
-- incoming state on a tie), entries stamped more than p_skew_ms ahead of the
-- server clock are dropped, malformed entries on either side are dropped, and
-- the result is capped at p_limit cells keeping the highest boxes, then the
-- most recently attempted. Runs as the caller (auth.uid()), so RLS on
-- user_progress still applies. Returns the stored schedule after the merge,
-- or NULL when the caller has no user_progress row yet.

CREATE OR REPLACE FUNCTION public.merge_cell_schedule(
  p_incoming jsonb,
  p_limit integer DEFAULT 2000,
  p_skew_ms bigint DEFAULT 300000
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_merged jsonb;
  v_max_last numeric := extract(epoch FROM clock_timestamp()) * 1000 + p_skew_ms;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_cell_schedule: not authenticated';
  END IF;
  IF p_incoming IS NULL OR jsonb_typeof(p_incoming) <> 'object' THEN
    RAISE EXCEPTION 'merge_cell_schedule: incoming schedule must be a JSON object';
  END IF;
  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'merge_cell_schedule: limit must be non-negative';
  END IF;

  SELECT cell_schedule INTO v_existing
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  WITH candidates AS (
    SELECT e.key, e.value, 0 AS priority
    FROM jsonb_each(p_incoming) AS e
    UNION ALL
    SELECT e.key, e.value, 1 AS priority
    FROM jsonb_each(COALESCE(v_existing, '{}'::jsonb)) AS e
  ),
  valid AS (
    SELECT
      key,
      value,
      priority,
      (value->>'last')::numeric AS last_ms,
      (value->>'box')::numeric AS box
    FROM candidates
    WHERE jsonb_typeof(value) = 'object'
      AND jsonb_typeof(value->'last') = 'number'
      AND jsonb_typeof(value->'box') = 'number'
      AND jsonb_typeof(value->'streak') = 'number'
      AND (value->>'last')::numeric >= 0
      AND (value->>'last')::numeric <= v_max_last
  ),
  latest AS (
    SELECT DISTINCT ON (key) key, value, last_ms, box
    FROM valid
    ORDER BY key, last_ms DESC, priority ASC
  ),
  kept AS (
    SELECT key, value
    FROM latest
    ORDER BY box DESC, last_ms DESC
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO v_merged
  FROM kept;

  UPDATE public.user_progress
  SET cell_schedule = v_merged, updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_merged;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_cell_schedule(jsonb, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_cell_schedule(jsonb, integer, bigint) TO authenticated, service_role;
