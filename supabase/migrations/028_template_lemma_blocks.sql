-- Per-template lemma blocks: admins can flag specific (template, lemma) pairs
-- as bad pairings (e.g. "this verb doesn't really take this noun"). The drill
-- engine reads a baked JSON snapshot (src/lib/data/lemma_blocks.json) at
-- build/runtime and filters blocked lemmas out of the candidate pool.
--
-- Workflow:
--   1. Reviewer clicks a lemma chip in /admin/audit/templates → upsert here.
--   2. `pnpm audit:bake-blocks` reads this table with a service-role client
--      and writes the JSON snapshot.
--   3. Snapshot is committed to git → drill engine picks it up at deploy time.
--
-- RLS: enabled with no client policies → all reads/writes via service-role
-- server endpoints, gated on profiles.is_admin (mirrors template_reviews).

CREATE TABLE public.template_lemma_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL CHECK (char_length(template_id) <= 200),
  template_type text NOT NULL CHECK (template_type IN ('sentence', 'adjective', 'pronoun')),
  lemma text NOT NULL CHECK (char_length(lemma) <= 200),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, template_type, lemma, reviewer_id)
);

ALTER TABLE public.template_lemma_blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX template_lemma_blocks_template_idx
  ON public.template_lemma_blocks (template_type, template_id);
CREATE INDEX template_lemma_blocks_reviewer_idx
  ON public.template_lemma_blocks (reviewer_id, created_at DESC);
