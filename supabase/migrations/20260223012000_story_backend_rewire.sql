-- Backend hardening for stories + close friends.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'close_friends'
      AND column_name = 'close_friend_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'close_friends'
        AND column_name = 'friend_id'
    ) THEN
      ALTER TABLE public.close_friends
        ADD COLUMN friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    UPDATE public.close_friends
    SET friend_id = close_friend_id
    WHERE friend_id IS NULL;
  END IF;
END;
$$;
ALTER TABLE public.close_friends
  ALTER COLUMN friend_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_close_friends_user_friend_unique
  ON public.close_friends(user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_close_friends_friend_id
  ON public.close_friends(friend_id);
CREATE OR REPLACE FUNCTION public.can_view_story_for_user(
  p_story_owner_id UUID,
  p_audience TEXT,
  p_viewer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_story_owner_id = p_viewer_id
    OR (
      COALESCE(p_audience, 'followers') = 'followers'
      AND EXISTS (
        SELECT 1
        FROM public.follows f
        WHERE f.follower_id = p_viewer_id
          AND f.following_id = p_story_owner_id
      )
    )
    OR (
      COALESCE(p_audience, 'followers') = 'close_friends'
      AND EXISTS (
        SELECT 1
        FROM public.close_friends cf
        WHERE cf.user_id = p_story_owner_id
          AND cf.friend_id = p_viewer_id
      )
    );
$$;
CREATE OR REPLACE FUNCTION public.can_reply_to_story_owner(
  p_story_owner_id UUID,
  p_sender_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reply_setting TEXT;
BEGIN
  IF p_story_owner_id = p_sender_id THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(us.interactions ->> 'story_replies', 'everyone')
  INTO reply_setting
  FROM public.user_settings us
  WHERE us.user_id = p_story_owner_id;

  IF reply_setting = 'off' THEN
    RETURN FALSE;
  END IF;

  IF reply_setting = 'following' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = p_sender_id
        AND f.following_id = p_story_owner_id
    );
  END IF;

  RETURN TRUE;
END;
$$;
DROP POLICY IF EXISTS "Users can view stories based on audience" ON public.stories;
CREATE POLICY "Users can view stories based on audience"
ON public.stories FOR SELECT
USING (
  public.can_view_story_for_user(stories.user_id, stories.audience, auth.uid())
);
DROP POLICY IF EXISTS "Users can insert own story views" ON public.story_views;
CREATE POLICY "Users can insert own story views"
ON public.story_views FOR INSERT
WITH CHECK (
  auth.uid() = viewer_id
  AND EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = story_views.story_id
      AND public.can_view_story_for_user(s.user_id, s.audience, auth.uid())
  )
);
DROP POLICY IF EXISTS "Users can insert own story replies" ON public.story_replies;
CREATE POLICY "Users can insert own story replies"
ON public.story_replies FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = story_replies.story_id
      AND s.user_id <> auth.uid()
      AND public.can_view_story_for_user(s.user_id, s.audience, auth.uid())
      AND public.can_reply_to_story_owner(s.user_id, auth.uid())
  )
);
CREATE OR REPLACE FUNCTION public.get_story_feed()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  media_url TEXT,
  media_type TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  audience TEXT,
  viewed BOOLEAN,
  user_username TEXT,
  user_display_name TEXT,
  user_avatar_url TEXT,
  user_is_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.user_id,
    s.media_url,
    s.media_type,
    s.thumbnail_url,
    s.caption,
    s.duration,
    s.created_at,
    s.expires_at,
    s.audience,
    (sv.id IS NOT NULL) AS viewed,
    p.username,
    p.display_name,
    p.avatar_url,
    p.is_verified
  FROM public.stories s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  LEFT JOIN public.story_views sv
    ON sv.story_id = s.id
   AND sv.viewer_id = auth.uid()
  WHERE s.expires_at > now()
    AND public.can_view_story_for_user(s.user_id, s.audience, auth.uid())
  ORDER BY s.created_at DESC;
$$;
CREATE OR REPLACE FUNCTION public.get_close_friend_candidates(
  search_query TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_close_friend BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH following AS (
    SELECT f.following_id AS user_id
    FROM public.follows f
    WHERE f.follower_id = auth.uid()
  )
  SELECT
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    (cf.id IS NOT NULL) AS is_close_friend
  FROM following f
  JOIN public.profiles p ON p.user_id = f.user_id
  LEFT JOIN public.close_friends cf
    ON cf.user_id = auth.uid()
   AND cf.friend_id = p.user_id
  WHERE (
    search_query IS NULL
    OR search_query = ''
    OR p.username ILIKE '%' || search_query || '%'
    OR p.display_name ILIKE '%' || search_query || '%'
  )
  ORDER BY (cf.id IS NOT NULL) DESC, p.username ASC
  LIMIT GREATEST(COALESCE(limit_count, 50), 1);
$$;
