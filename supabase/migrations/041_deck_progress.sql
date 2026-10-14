-- Per-deck practice totals on the account, so the Decks page shows the same
-- progress on every device. Each value is { attempts, correct, last: epoch ms },
-- keyed by deck id ("direction", "verbs", "numbers", "determiners"); see
-- src/lib/engine/deck-progress.ts.

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS deck_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Atomic merge of a device's deck totals into user_progress.deck_progress.
-- The totals are counters, and two devices can both count while apart, so
-- there is no exact merge without a log: per deck, the entry with more
-- attempts wins (then the more recent one, then the incoming one). The row is
-- locked (SELECT ... FOR UPDATE) so concurrent tabs and devices serialise.
-- Malformed entries on either side are dropped, and the result is capped at
-- p_limit decks, most recently practised first.
--
-- Mirrors mergeDeckProgress in src/lib/engine/deck-progress.ts. Runs as the
-- caller (auth.uid()), so RLS on user_progress still applies. Returns the
-- stored totals after the merge, or NULL when the caller has no
-- user_progress row yet.

CREATE OR REPLACE FUNCTION public.merge_deck_progress(
  p_incoming jsonb,
  p_limit integer DEFAULT 50
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_deck_progress: not authenticated';
  END IF;
  IF p_incoming IS NULL OR jsonb_typeof(p_incoming) <> 'object' THEN
    RAISE EXCEPTION 'merge_deck_progress: incoming totals must be a JSON object';
  END IF;
  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'merge_deck_progress: limit must be non-negative';
  END IF;

  SELECT deck_progress INTO v_existing
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
  -- Numbers are read only where the JSON says they are numbers, so a
  -- malformed entry is dropped instead of failing the cast.
  typed AS (
    SELECT
      key,
      value,
      priority,
      CASE WHEN jsonb_typeof(value->'attempts') = 'number'
           THEN (value->>'attempts')::numeric END AS attempts,
      CASE WHEN jsonb_typeof(value->'correct') = 'number'
           THEN (value->>'correct')::numeric END AS correct,
      CASE WHEN jsonb_typeof(value->'last') = 'number'
           THEN (value->>'last')::numeric END AS last_ms
    FROM candidates
    WHERE jsonb_typeof(value) = 'object'
      AND char_length(key) BETWEEN 1 AND 40
  ),
  valid AS (
    SELECT key, value, priority, attempts, last_ms
    FROM typed
    WHERE attempts IS NOT NULL AND correct IS NOT NULL AND last_ms IS NOT NULL
      AND attempts >= 0 AND attempts <= 10000000
      AND correct >= 0 AND correct <= attempts
      AND last_ms >= 0
  ),
  best AS (
    SELECT DISTINCT ON (key) key, value, last_ms
    FROM valid
    ORDER BY key, attempts DESC, last_ms DESC, priority ASC
  ),
  kept AS (
    SELECT key, value
    FROM best
    ORDER BY last_ms DESC, key
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO v_merged
  FROM kept;

  UPDATE public.user_progress
  SET deck_progress = v_merged, updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_merged;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_deck_progress(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_deck_progress(jsonb, integer) TO authenticated, service_role;
