-- Add like/save notifications and reconcile engagement counters

-- Expand notifications type check to support like/save events.
DO $$
DECLARE
  existing_constraint_name text;
BEGIN
  SELECT c.conname
  INTO existing_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'notifications'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type IN%'
  LIMIT 1;

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', existing_constraint_name);
  END IF;
END;
$$;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'message', 'comment', 'reply', 'like', 'save'));
-- Notify creator when a video is liked.
CREATE OR REPLACE FUNCTION public.create_notification_for_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
BEGIN
  SELECT v.user_id INTO target_user
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (
      target_user,
      NEW.user_id,
      'like',
      'New like',
      'liked your video',
      NEW.video_id
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_like ON public.likes;
CREATE TRIGGER trg_notify_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_like();
-- Notify creator when a video is saved/bookmarked.
CREATE OR REPLACE FUNCTION public.create_notification_for_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
BEGIN
  SELECT v.user_id INTO target_user
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (
      target_user,
      NEW.user_id,
      'save',
      'Post saved',
      'saved your video',
      NEW.video_id
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_save ON public.bookmarks;
CREATE TRIGGER trg_notify_save
AFTER INSERT ON public.bookmarks
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_save();
-- One-time reconciliation to keep counters in sync with source tables.
UPDATE public.videos v
SET likes_count = COALESCE(src.like_count, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS like_count
  FROM public.likes
  GROUP BY video_id
) src
WHERE src.video_id = v.id;
UPDATE public.videos v
SET likes_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.likes l WHERE l.video_id = v.id
);
UPDATE public.videos v
SET bookmarks_count = COALESCE(src.bookmark_count, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS bookmark_count
  FROM public.bookmarks
  GROUP BY video_id
) src
WHERE src.video_id = v.id;
UPDATE public.videos v
SET bookmarks_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.bookmarks b WHERE b.video_id = v.id
);
UPDATE public.videos v
SET comments_count = COALESCE(src.comment_count, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS comment_count
  FROM public.comments
  GROUP BY video_id
) src
WHERE src.video_id = v.id;
UPDATE public.videos v
SET comments_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.comments c WHERE c.video_id = v.id
);
