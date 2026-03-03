-- =============================================================================
-- Migration: All Missing Platform Features
-- Date: 2026-03-01
-- Adds: Group Chats, Carousel Posts, Story Interactive Stickers, Sound Library,
--       Stitch/Duet, Vanish Mode, Screenshot Tracking, Push Notification Tokens,
--       Live Gifts, Auto Captions, AR Filters, GIF/Sticker Library,
--       OAuth Providers, Payment Processing Stubs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. GROUP CHATS
-- ---------------------------------------------------------------------------
-- conversations.type already has 'dm'; add 'group' support
alter table public.conversations
  add column if not exists name text,
  add column if not exists avatar_url text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists max_participants int default 50;

-- Group admin roles
create table if not exists public.group_admins (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now(),
  unique(conversation_id, user_id)
);

alter table public.group_admins enable row level security;

create policy "group_admins_select" on public.group_admins
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = group_admins.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "group_admins_insert" on public.group_admins
  for insert with check (
    exists (
      select 1 from public.group_admins ga
      where ga.conversation_id = group_admins.conversation_id
        and ga.user_id = auth.uid()
        and ga.role = 'admin'
    )
    or (
      exists (
        select 1 from public.conversations c
        where c.id = group_admins.conversation_id
          and c.created_by = auth.uid()
      )
    )
  );

create policy "group_admins_delete" on public.group_admins
  for delete using (
    exists (
      select 1 from public.group_admins ga
      where ga.conversation_id = group_admins.conversation_id
        and ga.user_id = auth.uid()
        and ga.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. VANISH MODE / DISAPPEARING MESSAGES
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists vanish_mode boolean not null default false,
  add column if not exists disappearing_ttl_seconds int; -- null = no auto-delete

alter table public.messages
  add column if not exists expires_at timestamptz,
  add column if not exists is_vanish boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. SCREENSHOT TRACKING
-- ---------------------------------------------------------------------------
create table if not exists public.screenshot_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('snap', 'story', 'message', 'profile')),
  target_id text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.screenshot_events enable row level security;

create policy "screenshot_events_insert" on public.screenshot_events
  for insert with check (auth.uid() = user_id);

create policy "screenshot_events_select" on public.screenshot_events
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = screenshot_events.conversation_id
        and cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. CAROUSEL / PHOTO POSTS
-- ---------------------------------------------------------------------------
-- Extend videos table to support photo and carousel types
alter table public.videos
  add column if not exists post_type text not null default 'video'
    check (post_type in ('video', 'photo', 'carousel')),
  add column if not exists media_urls text[] default '{}';

create table if not exists public.carousel_items (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  sort_order int not null default 0,
  width int,
  height int,
  duration_ms int,
  created_at timestamptz not null default now()
);

alter table public.carousel_items enable row level security;

create policy "carousel_items_select" on public.carousel_items
  for select using (true);

create policy "carousel_items_insert" on public.carousel_items
  for insert with check (
    exists (
      select 1 from public.videos v
      where v.id = carousel_items.video_id
        and v.user_id = auth.uid()
    )
  );

create policy "carousel_items_delete" on public.carousel_items
  for delete using (
    exists (
      select 1 from public.videos v
      where v.id = carousel_items.video_id
        and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. STORY INTERACTIVE STICKERS
-- ---------------------------------------------------------------------------
create table if not exists public.story_stickers (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sticker_type text not null check (sticker_type in (
    'poll', 'quiz', 'question', 'countdown', 'link', 'mention', 'location',
    'hashtag', 'emoji_slider', 'music'
  )),
  payload jsonb not null default '{}',
  position_x float not null default 0.5,
  position_y float not null default 0.5,
  rotation float not null default 0,
  scale float not null default 1.0,
  created_at timestamptz not null default now()
);

alter table public.story_stickers enable row level security;

create policy "story_stickers_select" on public.story_stickers
  for select using (true);

create policy "story_stickers_insert" on public.story_stickers
  for insert with check (
    exists (
      select 1 from public.stories s
      where s.id = story_stickers.story_id
        and s.user_id = auth.uid()
    )
  );

-- Poll votes
create table if not exists public.story_poll_votes (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  unique(sticker_id, user_id)
);

alter table public.story_poll_votes enable row level security;

create policy "story_poll_votes_select" on public.story_poll_votes
  for select using (true);

create policy "story_poll_votes_insert" on public.story_poll_votes
  for insert with check (auth.uid() = user_id);

-- Quiz answers
create table if not exists public.story_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_index int not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique(sticker_id, user_id)
);

alter table public.story_quiz_answers enable row level security;

create policy "story_quiz_answers_select" on public.story_quiz_answers
  for select using (true);

create policy "story_quiz_answers_insert" on public.story_quiz_answers
  for insert with check (auth.uid() = user_id);

-- Question box responses
create table if not exists public.story_question_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_text text not null,
  created_at timestamptz not null default now()
);

alter table public.story_question_responses enable row level security;

create policy "story_question_responses_select" on public.story_question_responses
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.story_stickers ss
      join public.stories s on s.id = ss.story_id
      where ss.id = story_question_responses.sticker_id
        and s.user_id = auth.uid()
    )
  );

create policy "story_question_responses_insert" on public.story_question_responses
  for insert with check (auth.uid() = user_id);

-- Emoji slider votes
create table if not exists public.story_emoji_slider_votes (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value float not null check (value >= 0 and value <= 1),
  created_at timestamptz not null default now(),
  unique(sticker_id, user_id)
);

alter table public.story_emoji_slider_votes enable row level security;

create policy "story_emoji_slider_votes_select" on public.story_emoji_slider_votes
  for select using (true);

create policy "story_emoji_slider_votes_insert" on public.story_emoji_slider_votes
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. SOUND / AUDIO LIBRARY
-- ---------------------------------------------------------------------------
create table if not exists public.sounds (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  audio_url text not null,
  cover_url text,
  duration_ms int not null default 0,
  genre text,
  is_original boolean not null default false,
  original_video_id uuid references public.videos(id) on delete set null,
  use_count int not null default 0,
  is_trending boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sounds enable row level security;

create policy "sounds_select" on public.sounds for select using (true);

create policy "sounds_insert" on public.sounds
  for insert with check (auth.uid() is not null);

-- Link sounds to videos
alter table public.videos
  add column if not exists sound_id uuid references public.sounds(id) on delete set null;

-- Trending sounds view
create or replace view public.trending_sounds as
  select s.*, count(v.id) as recent_use_count
  from public.sounds s
  left join public.videos v on v.sound_id = s.id
    and v.created_at > now() - interval '7 days'
  group by s.id
  order by count(v.id) desc, s.use_count desc
  limit 50;

-- ---------------------------------------------------------------------------
-- 7. STITCH & DUET
-- ---------------------------------------------------------------------------
create table if not exists public.video_remixes (
  id uuid primary key default gen_random_uuid(),
  original_video_id uuid not null references public.videos(id) on delete cascade,
  remix_video_id uuid not null references public.videos(id) on delete cascade,
  remix_type text not null check (remix_type in ('stitch', 'duet', 'remix')),
  clip_start_ms int,
  clip_end_ms int,
  created_at timestamptz not null default now(),
  unique(original_video_id, remix_video_id)
);

alter table public.video_remixes enable row level security;

create policy "video_remixes_select" on public.video_remixes for select using (true);

create policy "video_remixes_insert" on public.video_remixes
  for insert with check (
    exists (
      select 1 from public.videos v
      where v.id = video_remixes.remix_video_id
        and v.user_id = auth.uid()
    )
  );

-- Allow/disallow stitch/duet per video
alter table public.videos
  add column if not exists allow_stitch boolean not null default true,
  add column if not exists allow_duet boolean not null default true,
  add column if not exists allow_remix boolean not null default true;

-- ---------------------------------------------------------------------------
-- 8. PUSH NOTIFICATION TOKENS
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('fcm', 'apns', 'web')),
  device_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens_own" on public.push_tokens
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9. LIVE STREAM GIFTS
-- ---------------------------------------------------------------------------
create table if not exists public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null,
  coin_cost int not null,
  animation_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gift_catalog enable row level security;

create policy "gift_catalog_select" on public.gift_catalog for select using (true);

create table if not exists public.live_gifts (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  gift_id uuid not null references public.gift_catalog(id),
  quantity int not null default 1,
  coin_total int not null,
  created_at timestamptz not null default now()
);

alter table public.live_gifts enable row level security;

create policy "live_gifts_select" on public.live_gifts for select using (true);

create policy "live_gifts_insert" on public.live_gifts
  for insert with check (auth.uid() = sender_id);

-- User coin balance
create table if not exists public.coin_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  total_earned int not null default 0,
  total_spent int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.coin_balances enable row level security;

create policy "coin_balances_own" on public.coin_balances
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 10. AUTO CAPTIONS / SUBTITLES
-- ---------------------------------------------------------------------------
create table if not exists public.video_captions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  language text not null default 'en',
  caption_url text, -- VTT or SRT file URL
  segments jsonb not null default '[]', -- [{start_ms, end_ms, text}]
  source text not null default 'auto' check (source in ('auto', 'manual', 'imported')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique(video_id, language)
);

alter table public.video_captions enable row level security;

create policy "video_captions_select" on public.video_captions for select using (true);

create policy "video_captions_manage" on public.video_captions
  for all using (
    exists (
      select 1 from public.videos v
      where v.id = video_captions.video_id
        and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 11. GIF / STICKER LIBRARY
-- ---------------------------------------------------------------------------
create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cover_url text,
  creator_id uuid references auth.users(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sticker_packs enable row level security;
create policy "sticker_packs_select" on public.sticker_packs for select using (true);

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  url text not null,
  keywords text[] default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.stickers enable row level security;
create policy "stickers_select" on public.stickers for select using (true);

-- Message media type expansion for GIFs/stickers
-- messages.media_type already has text; we add sticker/gif recognition

-- ---------------------------------------------------------------------------
-- 12. PAYMENTS / STRIPE INTEGRATION STUBS
-- ---------------------------------------------------------------------------
create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  stripe_customer_id text,
  stripe_account_id text, -- connected account for creators
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_accounts enable row level security;

create policy "payment_accounts_own" on public.payment_accounts
  for all using (auth.uid() = user_id);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id),
  to_user_id uuid references auth.users(id),
  amount_cents int not null,
  currency text not null default 'usd',
  transaction_type text not null check (transaction_type in (
    'tip', 'subscription', 'gift_purchase', 'coin_purchase', 'payout'
  )),
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'succeeded', 'failed', 'refunded'
  )),
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.payment_transactions enable row level security;

create policy "payment_transactions_own" on public.payment_transactions
  for select using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );

-- ---------------------------------------------------------------------------
-- 13. LOCATION TAGGING
-- ---------------------------------------------------------------------------
alter table public.videos
  add column if not exists location_name text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

alter table public.stories
  add column if not exists location_name text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

-- ---------------------------------------------------------------------------
-- 14. SEED: DEFAULT GIFT CATALOG
-- ---------------------------------------------------------------------------
insert into public.gift_catalog (name, emoji, coin_cost, sort_order) values
  ('Rose', '🌹', 1, 1),
  ('Heart', '❤️', 5, 2),
  ('Fire', '🔥', 10, 3),
  ('Star', '⭐', 50, 4),
  ('Diamond', '💎', 100, 5),
  ('Crown', '👑', 500, 6),
  ('Rocket', '🚀', 1000, 7),
  ('Universe', '🌌', 5000, 8)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 15. SEED: DEFAULT STICKER PACK
-- ---------------------------------------------------------------------------
insert into public.sticker_packs (name, is_default) values
  ('Opium Essentials', true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 16. HELPER RPCs
-- ---------------------------------------------------------------------------

-- Get trending sounds
create or replace function public.get_trending_sounds(p_limit int default 20)
returns setof public.sounds
language sql stable security definer
as $$
  select s.*
  from public.sounds s
  order by s.use_count desc, s.created_at desc
  limit p_limit;
$$;

-- Get videos by sound
create or replace function public.get_videos_by_sound(p_sound_id uuid, p_limit int default 30)
returns setof public.videos
language sql stable security definer
as $$
  select v.*
  from public.videos v
  where v.sound_id = p_sound_id
  order by v.created_at desc
  limit p_limit;
$$;

-- Get stitch/duet source info
create or replace function public.get_remix_info(p_video_id uuid)
returns table(
  remix_type text,
  original_video_id uuid,
  original_creator_id uuid,
  original_description text,
  original_thumbnail_url text
)
language sql stable security definer
as $$
  select
    vr.remix_type,
    vr.original_video_id,
    ov.user_id as original_creator_id,
    ov.description as original_description,
    ov.thumbnail_url as original_thumbnail_url
  from public.video_remixes vr
  join public.videos ov on ov.id = vr.original_video_id
  where vr.remix_video_id = p_video_id;
$$;

-- Group chat creation helper
create or replace function public.create_group_chat(
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql security definer
as $$
declare
  v_conversation_id uuid;
  v_member_id uuid;
begin
  insert into public.conversations (type, name, created_by)
  values ('group', p_name, auth.uid())
  returning id into v_conversation_id;

  -- Add creator as participant and admin
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, auth.uid());

  insert into public.group_admins (conversation_id, user_id, role)
  values (v_conversation_id, auth.uid(), 'admin');

  -- Add members
  foreach v_member_id in array p_member_ids loop
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conversation_id, v_member_id)
    on conflict do nothing;
  end loop;

  return v_conversation_id;
end;
$$;
