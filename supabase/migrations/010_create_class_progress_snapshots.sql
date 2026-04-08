-- Daily progress snapshots for class students (historical accuracy tracking)

CREATE TABLE IF NOT EXISTS public.class_progress_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  overall_accuracy numeric(5,2),
  total_questions integer NOT NULL DEFAULT 0,
  nom_accuracy numeric(5,2),
  gen_accuracy numeric(5,2),
  dat_accuracy numeric(5,2),
  acc_accuracy numeric(5,2),
  voc_accuracy numeric(5,2),
  loc_accuracy numeric(5,2),
  ins_accuracy numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id, snapshot_date)
);

CREATE INDEX idx_class_progress_snapshots_class_date
  ON public.class_progress_snapshots(class_id, snapshot_date);

ALTER TABLE public.class_progress_snapshots ENABLE ROW LEVEL SECURITY;

-- Helper to check snapshot ownership for RLS
CREATE OR REPLACE FUNCTION public.is_snapshot_class_teacher(p_class_id uuid, p_teacher_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = p_teacher_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Teachers can read snapshots for classes they own
CREATE POLICY "Teachers can read snapshots for own classes"
  ON public.class_progress_snapshots FOR SELECT
  USING (public.is_snapshot_class_teacher(class_id, auth.uid()));

-- Students can read their own snapshots
CREATE POLICY "Students can read own snapshots"
  ON public.class_progress_snapshots FOR SELECT
  USING (auth.uid() = student_id);
