create table if not exists public.mobile_social_likes (
  device_id text not null,
  post_id text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, post_id)
);
create table if not exists public.mobile_social_saves (
  device_id text not null,
  post_id text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, post_id)
);
create table if not exists public.mobile_social_conversations (
  id text not null,
  device_id text not null,
  name text not null,
  last_message text not null default '',
  unread int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, device_id)
);
create table if not exists public.mobile_social_messages (
  id bigint generated always as identity primary key,
  device_id text not null,
  conversation_id text not null,
  text text not null,
  is_mine boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mobile_social_messages_conversation_fk
    foreign key (conversation_id, device_id)
    references public.mobile_social_conversations (id, device_id)
    on delete cascade
);
create table if not exists public.mobile_social_posts (
  id text primary key,
  device_id text not null,
  creator text not null default '@you',
  caption text not null,
  thumbnail_url text not null default '',
  video_url text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_mobile_social_messages_device_created
  on public.mobile_social_messages (device_id, created_at desc);
create index if not exists idx_mobile_social_posts_device_created
  on public.mobile_social_posts (device_id, created_at desc);
alter table public.mobile_social_likes enable row level security;
alter table public.mobile_social_saves enable row level security;
alter table public.mobile_social_conversations enable row level security;
alter table public.mobile_social_messages enable row level security;
alter table public.mobile_social_posts enable row level security;
