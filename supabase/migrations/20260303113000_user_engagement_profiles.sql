-- Persist per-user engagement loop state for cross-device sync

create table if not exists public.user_engagement_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  engagement_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_engagement_profiles_updated_at
  on public.user_engagement_profiles(updated_at desc);

alter table public.user_engagement_profiles enable row level security;

drop policy if exists "user_engagement_profiles_select_own" on public.user_engagement_profiles;
create policy "user_engagement_profiles_select_own"
  on public.user_engagement_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_engagement_profiles_insert_own" on public.user_engagement_profiles;
create policy "user_engagement_profiles_insert_own"
  on public.user_engagement_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_engagement_profiles_update_own" on public.user_engagement_profiles;
create policy "user_engagement_profiles_update_own"
  on public.user_engagement_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
