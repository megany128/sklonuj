-- Store user mistake records for cross-device sync
CREATE TABLE IF NOT EXISTS public.user_mistakes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mistakes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_mistakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mistakes" ON public.user_mistakes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own mistakes" ON public.user_mistakes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own mistakes" ON public.user_mistakes FOR UPDATE USING (auth.uid() = user_id);
