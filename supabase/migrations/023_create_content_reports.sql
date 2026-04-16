-- Content reports: user-submitted reports about drill content (wrong answers, bad sentences, etc.)
CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('wrong_answer', 'bad_sentence', 'bad_explanation', 'other')),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  drill_type text CHECK (drill_type IS NULL OR char_length(drill_type) <= 100),
  lemma text CHECK (lemma IS NULL OR char_length(lemma) <= 200),
  case_name text CHECK (case_name IS NULL OR char_length(case_name) <= 50),
  number_form text CHECK (number_form IS NULL OR char_length(number_form) <= 20),
  expected_answer text CHECK (expected_answer IS NULL OR char_length(expected_answer) <= 500),
  user_answer text CHECK (user_answer IS NULL OR char_length(user_answer) <= 500),
  sentence text CHECK (sentence IS NULL OR char_length(sentence) <= 1000),
  explanation text CHECK (explanation IS NULL OR char_length(explanation) <= 2000),
  context jsonb,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  page_url text CHECK (page_url IS NULL OR char_length(page_url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: no policies = server-side only (safe, prevents client access).
-- Matches `contact_messages`: inserts happen through the server-side Supabase
-- client in the /api/report endpoint, never directly from the browser.
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
