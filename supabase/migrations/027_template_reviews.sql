-- Template reviews: admin reviewers (BF, italki tutor, prof, etc) mark each
-- sentence/adjective/pronoun template as ok / needs_fix / wrong with optional
-- notes. One row per (template_id, template_type, reviewer_id) — different
-- reviewers can disagree.
--
-- RLS: enabled with no client policies → all reads/writes via service-role
-- server endpoints, gated on profiles.is_admin (mirrors content_reports).

CREATE TABLE public.template_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL CHECK (char_length(template_id) <= 200),
  template_type text NOT NULL CHECK (template_type IN ('sentence', 'adjective', 'pronoun')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('ok', 'needs_fix', 'wrong')),
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, template_type, reviewer_id)
);

ALTER TABLE public.template_reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX template_reviews_template_idx
  ON public.template_reviews (template_type, template_id);
CREATE INDEX template_reviews_reviewer_idx
  ON public.template_reviews (reviewer_id, updated_at DESC);
