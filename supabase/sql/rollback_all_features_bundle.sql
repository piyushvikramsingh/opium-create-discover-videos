-- Rollback bundle for relevance + interest feature set
-- Run only if you want to remove the newly added feature schema.

BEGIN;

-- Remove triggers first
DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;

-- Remove trigger functions
DROP FUNCTION IF EXISTS public.create_notification_for_message();
DROP FUNCTION IF EXISTS public.create_notification_for_comment();
DROP FUNCTION IF EXISTS public.create_notification_for_follow();

-- Remove publication table (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication p
    WHERE p.pubname = 'supabase_realtime'
  ) AND EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
  END IF;
END;
$$;

-- Drop feature tables (children -> parents)
DROP TABLE IF EXISTS public.video_reports;
DROP TABLE IF EXISTS public.hidden_videos;
DROP TABLE IF EXISTS public.user_mutes;
DROP TABLE IF EXISTS public.user_blocks;
DROP TABLE IF EXISTS public.referrals;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.video_events;

-- Drop interests index/column
DROP INDEX IF EXISTS public.idx_profiles_interests_gin;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS interests;

COMMIT;
