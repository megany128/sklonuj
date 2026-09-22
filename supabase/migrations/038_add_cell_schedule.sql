-- Spaced-repetition state per drillable "cell" (paradigm × case × number for
-- nouns, paradigm type × gender × case × number for adjectives, pronoun × case
-- × number for pronouns) so case/cell selection can prefer what is due rather
-- than pure weighted random. Each value is { last: epoch ms, box: Leitner
-- box 0..5, streak: consecutive correct }. Keys are built in
-- src/lib/engine/spacing.ts ("n:hrad:gen:sg", "a:hard:f:dat:pl", "p:já:acc:sg").
alter table public.user_progress
	add column if not exists cell_schedule jsonb not null default '{}'::jsonb;
