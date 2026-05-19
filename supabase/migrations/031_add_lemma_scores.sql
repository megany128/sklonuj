-- Per-lemma attempt/correct tracking so the noun selector can prefer
-- unseen or weakly-learned lemmas instead of weighting purely by paradigm.
-- Keyed as "${lemma}_${case}_${number}" in application code.
alter table public.user_progress
	add column if not exists lemma_scores jsonb not null default '{}'::jsonb;
