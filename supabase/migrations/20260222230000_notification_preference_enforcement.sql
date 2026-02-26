-- Enforce granular notification preferences for trigger-driven notifications.

CREATE OR REPLACE FUNCTION public.create_notification_for_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  should_notify BOOLEAN;
BEGIN
  SELECT COALESCE((us.notifications ->> 'push_follows')::BOOLEAN, true)
  INTO should_notify
  FROM auth.users au
  LEFT JOIN public.user_settings us ON us.user_id = au.id
  WHERE au.id = NEW.following_id;

  IF COALESCE(should_notify, true) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (
      NEW.following_id,
      NEW.follower_id,
      'follow',
      'New follower',
      'started following you',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_notification_for_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
  should_notify BOOLEAN;
BEGIN
  SELECT v.user_id INTO target_user
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    SELECT COALESCE((us.notifications ->> 'push_comments')::BOOLEAN, p.push_comments, true)
    INTO should_notify
    FROM auth.users au
    LEFT JOIN public.user_settings us ON us.user_id = au.id
    LEFT JOIN public.profiles p ON p.user_id = au.id
    WHERE au.id = target_user;

    IF COALESCE(should_notify, true) THEN
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
  END IF;

  RETURN NEW;
END;
$$;
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
  LEFT JOIN public.user_settings us ON us.user_id = cp.user_id
  LEFT JOIN public.profiles p ON p.user_id = cp.user_id
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
    AND COALESCE((us.notifications ->> 'push_messages')::BOOLEAN, p.push_messages, true);

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_notification_for_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
  should_notify BOOLEAN;
BEGIN
  SELECT v.user_id INTO target_user
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    SELECT COALESCE((us.notifications ->> 'push_likes')::BOOLEAN, p.push_likes, true)
    INTO should_notify
    FROM auth.users au
    LEFT JOIN public.user_settings us ON us.user_id = au.id
    LEFT JOIN public.profiles p ON p.user_id = au.id
    WHERE au.id = target_user;

    IF COALESCE(should_notify, true) THEN
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
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_notification_for_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
  should_notify BOOLEAN;
BEGIN
  SELECT v.user_id INTO target_user
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    SELECT COALESCE((us.notifications ->> 'push_saves')::BOOLEAN, true)
    INTO should_notify
    FROM auth.users au
    LEFT JOIN public.user_settings us ON us.user_id = au.id
    WHERE au.id = target_user;

    IF COALESCE(should_notify, true) THEN
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
  END IF;

  RETURN NEW;
END;
$$;
