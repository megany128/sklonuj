-- Contact messages: store form submissions
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
  email text NOT NULL CHECK (char_length(email) > 0 AND char_length(email) <= 200),
  category text NOT NULL CHECK (category IN ('feature', 'bug', 'general')),
  message text NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: no policies = server-side only (safe, prevents client access)
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
