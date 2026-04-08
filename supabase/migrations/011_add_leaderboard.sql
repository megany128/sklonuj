-- Add leaderboard toggle to classes
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS leaderboard_enabled boolean NOT NULL DEFAULT true;

-- Reactions table for leaderboard emoji reactions
CREATE TABLE IF NOT EXISTS public.leaderboard_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN (E'\U0001F525', E'\U0001F44F')),
  week_start date NOT NULL,
  sent_date date NOT NULL DEFAULT current_date,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, from_user_id, to_user_id, sent_date)
);

CREATE INDEX idx_leaderboard_reactions_class_id ON public.leaderboard_reactions(class_id);
CREATE INDEX idx_leaderboard_reactions_to_user ON public.leaderboard_reactions(to_user_id);
CREATE INDEX idx_leaderboard_reactions_week ON public.leaderboard_reactions(week_start);

-- Enable RLS
ALTER TABLE public.leaderboard_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is class member or teacher
CREATE OR REPLACE FUNCTION public.is_class_participant(p_class_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.classes WHERE id = p_class_id AND teacher_id = p_user_id
  ) OR EXISTS(
    SELECT 1 FROM public.class_memberships WHERE class_id = p_class_id AND student_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Students can read reactions they sent or received
CREATE POLICY "Users can read own reactions"
  ON public.leaderboard_reactions FOR SELECT
  USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

-- Teachers can read all reactions for their classes
CREATE POLICY "Teachers can read class reactions"
  ON public.leaderboard_reactions FOR SELECT
  USING (public.is_class_teacher(class_id, auth.uid()));

-- Students can insert reactions where they are the sender
CREATE POLICY "Users can send reactions"
  ON public.leaderboard_reactions FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Users can update their own received reactions (to mark as read)
CREATE POLICY "Users can mark own reactions as read"
  ON public.leaderboard_reactions FOR UPDATE
  USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);
