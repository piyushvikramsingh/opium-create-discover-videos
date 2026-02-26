-- Relevance MVP: personalization signals, notifications, safety controls, and referral growth

-- Personalization events
CREATE TABLE IF NOT EXISTS public.video_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'view_start',
      'view_3s',
      'view_complete',
      'like',
      'share',
      'follow',
      'hide',
      'report'
    )
  ),
  watch_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own video events" ON public.video_events;
CREATE POLICY "Users can view own video events"
ON public.video_events FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own video events" ON public.video_events;
CREATE POLICY "Users can insert own video events"
ON public.video_events FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_video_events_user_created ON public.video_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_events_video_type ON public.video_events(video_id, event_type);
-- In-app notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('follow', 'message', 'comment', 'reply')),
  title TEXT NOT NULL,
  body TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);
-- Safety tables: block, mute, hide, report
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_user_id),
  CHECK (user_id <> blocked_user_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own blocks" ON public.user_blocks;
CREATE POLICY "Users can view own blocks"
ON public.user_blocks FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own blocks" ON public.user_blocks;
CREATE POLICY "Users can insert own blocks"
ON public.user_blocks FOR INSERT
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete own blocks"
ON public.user_blocks FOR DELETE
USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_user ON public.user_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);
CREATE TABLE IF NOT EXISTS public.user_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, muted_user_id),
  CHECK (user_id <> muted_user_id)
);
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own mutes" ON public.user_mutes;
CREATE POLICY "Users can view own mutes"
ON public.user_mutes FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own mutes" ON public.user_mutes;
CREATE POLICY "Users can insert own mutes"
ON public.user_mutes FOR INSERT
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own mutes" ON public.user_mutes;
CREATE POLICY "Users can delete own mutes"
ON public.user_mutes FOR DELETE
USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_user ON public.user_mutes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_muted ON public.user_mutes(muted_user_id);
CREATE TABLE IF NOT EXISTS public.hidden_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);
ALTER TABLE public.hidden_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own hidden videos" ON public.hidden_videos;
CREATE POLICY "Users can view own hidden videos"
ON public.hidden_videos FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own hidden videos" ON public.hidden_videos;
CREATE POLICY "Users can insert own hidden videos"
ON public.hidden_videos FOR INSERT
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own hidden videos" ON public.hidden_videos;
CREATE POLICY "Users can delete own hidden videos"
ON public.hidden_videos FOR DELETE
USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_videos_user ON public.hidden_videos(user_id);
CREATE TABLE IF NOT EXISTS public.video_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.video_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reports" ON public.video_reports;
CREATE POLICY "Users can view own reports"
ON public.video_reports FOR SELECT
USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Users can insert own reports" ON public.video_reports;
CREATE POLICY "Users can insert own reports"
ON public.video_reports FOR INSERT
WITH CHECK (auth.uid() = reporter_id);
CREATE INDEX IF NOT EXISTS idx_video_reports_video ON public.video_reports(video_id, created_at DESC);
-- Referral growth
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'signed_up', 'activated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inviter_id, code)
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own referrals" ON public.referrals;
CREATE POLICY "Users can view own referrals"
ON public.referrals FOR SELECT
USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
DROP POLICY IF EXISTS "Users can create own referrals" ON public.referrals;
CREATE POLICY "Users can create own referrals"
ON public.referrals FOR INSERT
WITH CHECK (auth.uid() = inviter_id);
DROP POLICY IF EXISTS "Users can update own referral rows" ON public.referrals;
CREATE POLICY "Users can update own referral rows"
ON public.referrals FOR UPDATE
USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON public.referrals(inviter_id, created_at DESC);
-- Trigger notifications for follows/comments/messages
CREATE OR REPLACE FUNCTION public.create_notification_for_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
  VALUES (
    NEW.following_id,
    NEW.follower_id,
    'follow',
    'New follower',
    'started following you',
    NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;
CREATE TRIGGER trg_notify_follow
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_follow();
CREATE OR REPLACE FUNCTION public.create_notification_for_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
BEGIN
  SELECT user_id INTO target_user FROM public.videos WHERE id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (
      target_user,
      NEW.user_id,
      'comment',
      'New comment',
      'commented on your video',
      NEW.video_id
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
CREATE TRIGGER trg_notify_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_comment();
CREATE OR REPLACE FUNCTION public.create_notification_for_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
  SELECT
    cp.user_id,
    NEW.sender_id,
    CASE WHEN NEW.reply_to_message_id IS NULL THEN 'message' ELSE 'reply' END,
    CASE WHEN NEW.reply_to_message_id IS NULL THEN 'New message' ELSE 'New reply' END,
    COALESCE(LEFT(NEW.content, 120), 'sent you a message'),
    NEW.conversation_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_message();
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
