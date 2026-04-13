ALTER TABLE public.classes
ADD COLUMN struggling_threshold integer NOT NULL DEFAULT 50
CONSTRAINT struggling_threshold_range CHECK (struggling_threshold >= 0 AND struggling_threshold <= 100);
