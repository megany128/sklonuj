-- Allow students to leave classes they belong to by deleting their own membership row.
-- Previously, only teachers had a DELETE policy on class_memberships, so the student
-- leaveClass action silently affected 0 rows (RLS blocked the delete without erroring).

CREATE POLICY "Students can leave own class"
  ON public.class_memberships FOR DELETE
  USING (auth.uid() = student_id);
