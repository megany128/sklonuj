-- Read-only analytics surface for the PostHog data warehouse (Postgres source).
--
-- Why: PostHog's browser SDK is ad-blocked for a large share of learners, so
-- event counts undercount real usage. `practice_sessions` is the ground truth
-- for logged-in activity; exposing it as a warehouse table lets PostHog chart
-- true question counts / WAU alongside events.
--
-- Design:
--  * A separate `analytics` schema so the reader role sees nothing in `public`.
--  * Views are owned by `postgres` (table owner ⇒ exempt from RLS), so the
--    reader gets full rows without needing BYPASSRLS (superuser-only).
--  * No PII columns: user_id (uuid) only — no email / display_name / avatar.
--  * The role is created NOLOGIN here. Enabling login + setting the password is
--    a manual, out-of-git step (see below).
--
-- After applying, run ONCE with your own password (do NOT commit it):
--   alter role posthog_reader login password '<strong-random-password>';
-- Then in PostHog → Data pipeline → Sources → Postgres:
--   host = aws-1-us-east-1.pooler.supabase.com (session pooler, port 5432;
--          try aws-0-… if aws-1 fails), database = postgres,
--   user = posthog_reader.srkgzytqphdpohgemnqj, schema = analytics.

create schema if not exists analytics;

create or replace view analytics.practice_sessions as
  select
    id,
    user_id,
    session_date,
    questions_attempted,
    questions_correct,
    case_scores,
    created_at,
    updated_at
  from public.practice_sessions;

create or replace view analytics.user_progress as
  select
    user_id,
    level,
    current_streak,
    longest_streak,
    longest_answer_streak,
    last_practice_date,
    last_session,
    updated_at
  from public.user_progress;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'posthog_reader') then
    create role posthog_reader nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant connect on database postgres to posthog_reader;
grant usage on schema analytics to posthog_reader;
grant select on all tables in schema analytics to posthog_reader;
alter default privileges in schema analytics grant select on tables to posthog_reader;
revoke all on schema public from posthog_reader;
