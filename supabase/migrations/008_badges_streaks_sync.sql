-- Badges table
create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  unique(user_id, badge_id)
);

alter table user_badges enable row level security;

create policy "Users can view own badges" on user_badges for select using (auth.uid() = user_id);
create policy "Users can insert own badges" on user_badges for insert with check (auth.uid() = user_id);

-- Add streak columns to user_progress
alter table user_progress add column if not exists current_streak integer default 0;
alter table user_progress add column if not exists longest_streak integer default 0;
alter table user_progress add column if not exists last_practice_date date;
