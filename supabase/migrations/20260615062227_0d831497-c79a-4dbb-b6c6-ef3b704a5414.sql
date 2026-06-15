
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_search_fts
  ON public.profiles USING gin (
    to_tsvector('simple', coalesce(username,'') || ' ' || coalesce(display_name,'') || ' ' || coalesce(bio,''))
  );
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_videos_description_fts
  ON public.videos USING gin (to_tsvector('simple', coalesce(description,'') || ' ' || coalesce(music,'')));
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

CREATE OR REPLACE FUNCTION public.search_users(_q text, _limit int DEFAULT 20)
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, bio text, followers_count bigint, rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
    (SELECT COUNT(*) FROM public.follows f WHERE f.following_id = p.user_id) AS followers_count,
    (
      ts_rank(to_tsvector('simple',
        coalesce(p.username,'') || ' ' || coalesce(p.display_name,'') || ' ' || coalesce(p.bio,'')
      ), plainto_tsquery('simple', _q))
      + similarity(coalesce(p.username,''), _q) * 2
      + similarity(coalesce(p.display_name,''), _q)
    )::real AS rank
  FROM public.profiles p
  WHERE _q IS NOT NULL AND length(trim(_q)) > 0
    AND (
      p.username ILIKE '%' || _q || '%'
      OR p.display_name ILIKE '%' || _q || '%'
      OR to_tsvector('simple',
        coalesce(p.username,'') || ' ' || coalesce(p.display_name,'') || ' ' || coalesce(p.bio,'')
      ) @@ plainto_tsquery('simple', _q)
    )
  ORDER BY rank DESC NULLS LAST
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.search_videos(_q text, _limit int DEFAULT 30)
RETURNS TABLE(id uuid, user_id uuid, description text, video_url text, thumbnail_url text, likes_count int, rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id, v.user_id, v.description, v.video_url, v.thumbnail_url, v.likes_count,
    ts_rank(
      to_tsvector('simple', coalesce(v.description,'') || ' ' || coalesce(v.music,'')),
      plainto_tsquery('simple', _q)
    )::real AS rank
  FROM public.videos v
  WHERE _q IS NOT NULL AND length(trim(_q)) > 0
    AND to_tsvector('simple', coalesce(v.description,'') || ' ' || coalesce(v.music,''))
        @@ plainto_tsquery('simple', _q)
  ORDER BY rank DESC, v.likes_count DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.search_videos(text, int) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; actor_name text;
BEGIN
  SELECT user_id INTO owner_id FROM public.videos WHERE id = NEW.video_id;
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, username, 'Someone') INTO actor_name FROM public.profiles WHERE user_id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (owner_id, 'like', actor_name, 'liked your post',
    jsonb_build_object('video_id', NEW.video_id, 'actor_id', NEW.user_id));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; actor_name text;
BEGIN
  SELECT user_id INTO owner_id FROM public.videos WHERE id = NEW.video_id;
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, username, 'Someone') INTO actor_name FROM public.profiles WHERE user_id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (owner_id, 'comment', actor_name, 'commented: ' || LEFT(COALESCE(NEW.content,''), 80),
    jsonb_build_object('video_id', NEW.video_id, 'actor_id', NEW.user_id));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name text;
BEGIN
  IF NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, username, 'Someone') INTO actor_name FROM public.profiles WHERE user_id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (NEW.following_id, 'follow', actor_name, 'started following you',
    jsonb_build_object('actor_id', NEW.follower_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_like ON public.likes;
CREATE TRIGGER trg_notify_on_like AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();
DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.comments;
CREATE TRIGGER trg_notify_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();
DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.follows;
CREATE TRIGGER trg_notify_on_follow AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE is_read = false;

CREATE OR REPLACE FUNCTION public.get_ranked_feed(_user_id uuid, _limit int DEFAULT 30)
RETURNS TABLE(
  id uuid, user_id uuid, description text, video_url text, thumbnail_url text,
  music text, likes_count int, comments_count int, bookmarks_count int,
  shares_count int, interest_category text, created_at timestamptz, score real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH affinity AS (
    SELECT interest_category, (score * COALESCE(suppression_multiplier, 1.0))::real AS aff
    FROM public.user_interest_affinity WHERE user_id = _user_id
  ),
  scored AS (
    SELECT v.*,
      (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - v.created_at)) / 86400.0))::real AS recency,
      (LOG(GREATEST(v.likes_count, 0) + 1) * 1.0
       + LOG(GREATEST(v.comments_count, 0) + 1) * 1.5
       + LOG(GREATEST(v.bookmarks_count, 0) + 1) * 2.0
       + LOG(GREATEST(v.shares_count, 0) + 1) * 2.5)::real AS engagement,
      COALESCE((SELECT aff FROM affinity a WHERE a.interest_category = v.interest_category), 0)::real AS interest_boost,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.follows f WHERE f.follower_id = _user_id AND f.following_id = v.user_id
      ) THEN 3.0 ELSE 0 END AS follow_boost
    FROM public.videos v
    WHERE NOT EXISTS (SELECT 1 FROM public.hidden_videos h WHERE h.user_id = _user_id AND h.video_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = _user_id AND b.blocked_user_id = v.user_id)
      AND v.created_at > now() - interval '30 days'
  )
  SELECT
    s.id, s.user_id, s.description, s.video_url, s.thumbnail_url, s.music,
    s.likes_count, s.comments_count, s.bookmarks_count, s.shares_count,
    s.interest_category, s.created_at,
    (s.recency * 4.0 + s.engagement * 1.5 + s.interest_boost * 2.0 + s.follow_boost)::real AS score
  FROM scored s
  ORDER BY score DESC, s.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranked_feed(uuid, int) TO authenticated;
