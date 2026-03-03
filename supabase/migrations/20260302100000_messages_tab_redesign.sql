-- =============================================================================
-- Migration: Messages Tab Redesign
-- Date: 2026-03-02
-- Adds: Community groups, Chat streaks, Pinned messages, Creator auto-reply,
--       Smart reply suggestions, Enhanced conversation categorization
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. COMMUNITY GROUPS (extends existing group chat support)
-- ---------------------------------------------------------------------------
-- Add community-specific columns to conversations
alter table public.conversations
  add column if not exists is_community boolean not null default false,
  add column if not exists community_type text check (community_type in ('creator_circle', 'fan_club', 'event_group', 'general')),
  add column if not exists description text,
  add column if not exists is_paid boolean not null default false,
  add column if not exists membership_price_cents int default 0,
  add column if not exists member_count int not null default 0,
  add column if not exists is_public boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. CHAT STREAKS
-- ---------------------------------------------------------------------------
create table if not exists public.chat_streaks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  streak_count int not null default 0,
  last_interaction_at timestamptz not null default now(),
  longest_streak int not null default 0,
  created_at timestamptz not null default now(),
  unique(conversation_id, user_a, user_b)
);

alter table public.chat_streaks enable row level security;

create policy "chat_streaks_select" on public.chat_streaks
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "chat_streaks_upsert" on public.chat_streaks
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "chat_streaks_update" on public.chat_streaks
  for update using (auth.uid() = user_a or auth.uid() = user_b);

-- ---------------------------------------------------------------------------
-- 3. PINNED MESSAGES
-- ---------------------------------------------------------------------------
create table if not exists public.pinned_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(conversation_id, message_id)
);

alter table public.pinned_messages enable row level security;

create policy "pinned_messages_select" on public.pinned_messages
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = pinned_messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "pinned_messages_insert" on public.pinned_messages
  for insert with check (
    auth.uid() = pinned_by
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = pinned_messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "pinned_messages_delete" on public.pinned_messages
  for delete using (
    pinned_by = auth.uid()
    or exists (
      select 1 from public.group_admins ga
      where ga.conversation_id = pinned_messages.conversation_id
        and ga.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. CREATOR AUTO-REPLY SETTINGS
-- ---------------------------------------------------------------------------
create table if not exists public.creator_auto_reply (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  enabled boolean not null default false,
  message text not null default 'Thanks for reaching out! I''ll get back to you soon.',
  delay_seconds int not null default 0,
  active_hours_start time,
  active_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_auto_reply enable row level security;

create policy "creator_auto_reply_select" on public.creator_auto_reply
  for select using (true);

create policy "creator_auto_reply_manage" on public.creator_auto_reply
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. DISAPPEARING MODE SETTINGS (per-conversation)
-- ---------------------------------------------------------------------------
create table if not exists public.disappearing_mode (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade unique,
  enabled boolean not null default false,
  duration_hours int not null default 24,
  enabled_by uuid not null references auth.users(id) on delete cascade,
  enabled_at timestamptz not null default now()
);

alter table public.disappearing_mode enable row level security;

create policy "disappearing_mode_select" on public.disappearing_mode
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = disappearing_mode.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "disappearing_mode_manage" on public.disappearing_mode
  for all using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = disappearing_mode.conversation_id
        and cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. COMMUNITY MEMBERSHIP
-- ---------------------------------------------------------------------------
create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  is_paid boolean not null default false,
  subscription_expires_at timestamptz,
  unique(conversation_id, user_id)
);

alter table public.community_members enable row level security;

create policy "community_members_select" on public.community_members
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = community_members.conversation_id
        and cp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.conversations c
      where c.id = community_members.conversation_id
        and c.is_public = true
    )
  );

create policy "community_members_insert" on public.community_members
  for insert with check (auth.uid() = user_id);

create policy "community_members_delete" on public.community_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.community_members cm
      where cm.conversation_id = community_members.conversation_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 7. INDEXES for performance
-- ---------------------------------------------------------------------------
create index if not exists idx_chat_streaks_user_a on public.chat_streaks(user_a);
create index if not exists idx_chat_streaks_user_b on public.chat_streaks(user_b);
create index if not exists idx_chat_streaks_conversation on public.chat_streaks(conversation_id);
create index if not exists idx_pinned_messages_conversation on public.pinned_messages(conversation_id);
create index if not exists idx_community_members_conversation on public.community_members(conversation_id);
create index if not exists idx_community_members_user on public.community_members(user_id);
create index if not exists idx_conversations_is_community on public.conversations(is_community) where is_community = true;
create index if not exists idx_disappearing_mode_conversation on public.disappearing_mode(conversation_id);

-- ---------------------------------------------------------------------------
-- 8. FUNCTION: Update streak on message send
-- ---------------------------------------------------------------------------
create or replace function public.update_chat_streak()
returns trigger
language plpgsql
security definer
as $$
declare
  v_conv_type text;
  v_other_user uuid;
  v_current_streak record;
  v_hours_since numeric;
begin
  -- Only for DM conversations
  select type into v_conv_type from public.conversations where id = NEW.conversation_id;
  if v_conv_type != 'dm' then
    return NEW;
  end if;

  -- Find the other participant
  select user_id into v_other_user
  from public.conversation_participants
  where conversation_id = NEW.conversation_id
    and user_id != NEW.sender_id
  limit 1;

  if v_other_user is null then
    return NEW;
  end if;

  -- Ensure user_a < user_b for consistent ordering
  insert into public.chat_streaks (conversation_id, user_a, user_b, streak_count, last_interaction_at, longest_streak)
  values (
    NEW.conversation_id,
    least(NEW.sender_id, v_other_user),
    greatest(NEW.sender_id, v_other_user),
    1,
    now(),
    1
  )
  on conflict (conversation_id, user_a, user_b) do update set
    streak_count = case
      when extract(epoch from (now() - chat_streaks.last_interaction_at)) / 3600 > 48 then 1
      when extract(epoch from (now() - chat_streaks.last_interaction_at)) / 3600 > 24 then chat_streaks.streak_count + 1
      else chat_streaks.streak_count
    end,
    longest_streak = greatest(
      chat_streaks.longest_streak,
      case
        when extract(epoch from (now() - chat_streaks.last_interaction_at)) / 3600 > 48 then 1
        when extract(epoch from (now() - chat_streaks.last_interaction_at)) / 3600 > 24 then chat_streaks.streak_count + 1
        else chat_streaks.streak_count
      end
    ),
    last_interaction_at = now();

  return NEW;
end;
$$;

-- Trigger to auto-update streaks
drop trigger if exists trg_update_chat_streak on public.messages;
create trigger trg_update_chat_streak
  after insert on public.messages
  for each row
  execute function public.update_chat_streak();
