alter table public.mobile_social_likes
  rename column device_id to user_id;
alter table public.mobile_social_saves
  rename column device_id to user_id;
alter table public.mobile_social_conversations
  rename column device_id to user_id;
alter table public.mobile_social_messages
  rename column device_id to user_id;
alter table public.mobile_social_posts
  rename column device_id to user_id;
alter index if exists idx_mobile_social_messages_device_created
  rename to idx_mobile_social_messages_user_created;
alter index if exists idx_mobile_social_posts_device_created
  rename to idx_mobile_social_posts_user_created;
alter table public.mobile_social_likes enable row level security;
alter table public.mobile_social_saves enable row level security;
alter table public.mobile_social_conversations enable row level security;
alter table public.mobile_social_messages enable row level security;
alter table public.mobile_social_posts enable row level security;
drop policy if exists mobile_social_likes_owner_select on public.mobile_social_likes;
drop policy if exists mobile_social_likes_owner_insert on public.mobile_social_likes;
drop policy if exists mobile_social_likes_owner_delete on public.mobile_social_likes;
drop policy if exists mobile_social_saves_owner_select on public.mobile_social_saves;
drop policy if exists mobile_social_saves_owner_insert on public.mobile_social_saves;
drop policy if exists mobile_social_saves_owner_delete on public.mobile_social_saves;
drop policy if exists mobile_social_conversations_owner_select on public.mobile_social_conversations;
drop policy if exists mobile_social_conversations_owner_insert on public.mobile_social_conversations;
drop policy if exists mobile_social_conversations_owner_update on public.mobile_social_conversations;
drop policy if exists mobile_social_conversations_owner_delete on public.mobile_social_conversations;
drop policy if exists mobile_social_messages_owner_select on public.mobile_social_messages;
drop policy if exists mobile_social_messages_owner_insert on public.mobile_social_messages;
drop policy if exists mobile_social_messages_owner_update on public.mobile_social_messages;
drop policy if exists mobile_social_messages_owner_delete on public.mobile_social_messages;
drop policy if exists mobile_social_posts_owner_select on public.mobile_social_posts;
drop policy if exists mobile_social_posts_owner_insert on public.mobile_social_posts;
drop policy if exists mobile_social_posts_owner_update on public.mobile_social_posts;
drop policy if exists mobile_social_posts_owner_delete on public.mobile_social_posts;
create policy mobile_social_likes_owner_select
  on public.mobile_social_likes
  for select
  using (auth.uid()::text = user_id);
create policy mobile_social_likes_owner_insert
  on public.mobile_social_likes
  for insert
  with check (auth.uid()::text = user_id);
create policy mobile_social_likes_owner_delete
  on public.mobile_social_likes
  for delete
  using (auth.uid()::text = user_id);
create policy mobile_social_saves_owner_select
  on public.mobile_social_saves
  for select
  using (auth.uid()::text = user_id);
create policy mobile_social_saves_owner_insert
  on public.mobile_social_saves
  for insert
  with check (auth.uid()::text = user_id);
create policy mobile_social_saves_owner_delete
  on public.mobile_social_saves
  for delete
  using (auth.uid()::text = user_id);
create policy mobile_social_conversations_owner_select
  on public.mobile_social_conversations
  for select
  using (auth.uid()::text = user_id);
create policy mobile_social_conversations_owner_insert
  on public.mobile_social_conversations
  for insert
  with check (auth.uid()::text = user_id);
create policy mobile_social_conversations_owner_update
  on public.mobile_social_conversations
  for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
create policy mobile_social_conversations_owner_delete
  on public.mobile_social_conversations
  for delete
  using (auth.uid()::text = user_id);
create policy mobile_social_messages_owner_select
  on public.mobile_social_messages
  for select
  using (auth.uid()::text = user_id);
create policy mobile_social_messages_owner_insert
  on public.mobile_social_messages
  for insert
  with check (auth.uid()::text = user_id);
create policy mobile_social_messages_owner_update
  on public.mobile_social_messages
  for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
create policy mobile_social_messages_owner_delete
  on public.mobile_social_messages
  for delete
  using (auth.uid()::text = user_id);
create policy mobile_social_posts_owner_select
  on public.mobile_social_posts
  for select
  using (auth.uid()::text = user_id);
create policy mobile_social_posts_owner_insert
  on public.mobile_social_posts
  for insert
  with check (auth.uid()::text = user_id);
create policy mobile_social_posts_owner_update
  on public.mobile_social_posts
  for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
create policy mobile_social_posts_owner_delete
  on public.mobile_social_posts
  for delete
  using (auth.uid()::text = user_id);
