-- Teacher / Class Management tables

-- Helper function: generate unique 6-char class code
CREATE OR REPLACE FUNCTION public.generate_class_code()
RETURNS text AS $$
DECLARE
  code text;
  code_exists boolean;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.classes WHERE class_code = code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Classes
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
  class_code text NOT NULL UNIQUE CHECK (char_length(class_code) = 6),
  level text NOT NULL DEFAULT 'A1' CHECK (level IN ('A1','A2','B1','B2')),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX idx_classes_class_code ON public.classes(class_code);

-- Class memberships (students enrolled in a class)
CREATE TABLE public.class_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id)
);

CREATE INDEX idx_class_memberships_class_id ON public.class_memberships(class_id);
CREATE INDEX idx_class_memberships_student_id ON public.class_memberships(student_id);

-- Class invitations (email-based)
CREATE TABLE public.class_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) > 0 AND char_length(email) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(class_id, email)
);

CREATE INDEX idx_class_invitations_class_id ON public.class_invitations(class_id);
CREATE INDEX idx_class_invitations_email ON public.class_invitations(email);

-- Assignments
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description text CHECK (char_length(description) <= 1000),
  selected_cases text[] NOT NULL DEFAULT '{}',
  selected_drill_types text[] NOT NULL DEFAULT '{}',
  number_mode text NOT NULL DEFAULT 'both' CHECK (number_mode IN ('sg', 'pl', 'both')),
  content_mode text NOT NULL DEFAULT 'both' CHECK (content_mode IN ('nouns', 'pronouns', 'both')),
  target_questions integer NOT NULL DEFAULT 20 CHECK (target_questions > 0 AND target_questions <= 200),
  due_date timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_class_id ON public.assignments(class_id);
CREATE INDEX idx_assignments_due_date ON public.assignments(due_date) WHERE due_date IS NOT NULL;

-- Assignment progress (per student per assignment)
CREATE TABLE public.assignment_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  questions_attempted integer NOT NULL DEFAULT 0,
  questions_correct integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX idx_assignment_progress_assignment_id ON public.assignment_progress(assignment_id);
CREATE INDEX idx_assignment_progress_student_id ON public.assignment_progress(student_id);

-- Helper functions to avoid infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.is_class_member(p_class_id uuid, p_student_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.class_memberships
    WHERE class_id = p_class_id AND student_id = p_student_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id uuid, p_teacher_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = p_teacher_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.assignments a
    JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = p_assignment_id AND c.teacher_id = p_teacher_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- RLS Policies

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_progress ENABLE ROW LEVEL SECURITY;

-- CLASSES policies
CREATE POLICY "Teachers can manage own classes"
  ON public.classes FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Students can view classes they belong to"
  ON public.classes FOR SELECT
  USING (public.is_class_member(id, auth.uid()));

-- CLASS_MEMBERSHIPS policies
CREATE POLICY "Teachers can manage memberships for own classes"
  ON public.class_memberships FOR ALL
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY "Students can view own memberships"
  ON public.class_memberships FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can join classes"
  ON public.class_memberships FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- CLASS_INVITATIONS policies
CREATE POLICY "Teachers can manage invitations for own classes"
  ON public.class_invitations FOR ALL
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

-- ASSIGNMENTS policies
CREATE POLICY "Teachers can manage assignments for own classes"
  ON public.assignments FOR ALL
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY "Students can view assignments for their classes"
  ON public.assignments FOR SELECT
  USING (public.is_class_member(class_id, auth.uid()));

-- ASSIGNMENT_PROGRESS policies
CREATE POLICY "Students can manage own assignment progress"
  ON public.assignment_progress FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers can view progress for their class assignments"
  ON public.assignment_progress FOR SELECT
  USING (public.is_assignment_teacher(assignment_id, auth.uid()));
