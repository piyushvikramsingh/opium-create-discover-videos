-- Close friends lists and story audience controls.

CREATE TABLE IF NOT EXISTS public.close_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS idx_close_friends_user_id ON public.close_friends(user_id);
CREATE INDEX IF NOT EXISTS idx_close_friends_friend_id ON public.close_friends(friend_id);
ALTER TABLE public.close_friends
  ADD COLUMN IF NOT EXISTS friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own close friends" ON public.close_friends;
CREATE POLICY "Users can view own close friends"
ON public.close_friends FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can manage own close friends" ON public.close_friends;
CREATE POLICY "Users can manage own close friends"
ON public.close_friends FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'followers';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'stories'
      AND c.conname = 'stories_audience_check'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_audience_check
      CHECK (audience IN ('followers', 'close_friends'));
  END IF;
END;
$$;
DROP POLICY IF EXISTS "Users can view stories from public accounts or followed accounts" ON public.stories;
DROP POLICY IF EXISTS "Users can view stories based on audience" ON public.stories;
CREATE POLICY "Users can view stories based on audience"
ON public.stories FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    audience = 'followers'
    AND EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = auth.uid()
        AND f.following_id = stories.user_id
    )
  )
  OR (
    audience = 'close_friends'
    AND EXISTS (
      SELECT 1
      FROM public.close_friends cf
      WHERE cf.user_id = stories.user_id
        AND cf.friend_id = auth.uid()
    )
  )
);
