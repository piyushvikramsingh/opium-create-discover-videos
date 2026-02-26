-- Story reply notifications and clearer DM context for story reply bridge.

DO $$
DECLARE
  existing_constraint_name TEXT;
BEGIN
  SELECT c.conname
  INTO existing_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND t.relname = 'notifications'
    AND pg_get_constraintdef(c.oid) ILIKE '%type IN%';

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', existing_constraint_name);
  END IF;
END;
$$;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'follow',
    'message',
    'message_request',
    'story_reply',
    'comment',
    'reply',
    'like',
    'save',
    'recap',
    'reengage'
  ));
CREATE OR REPLACE FUNCTION public.bridge_story_reply_to_dm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  story_owner_id UUID;
  target_conversation_id UUID;
BEGIN
  SELECT s.user_id
  INTO story_owner_id
  FROM public.stories s
  WHERE s.id = NEW.story_id;

  IF story_owner_id IS NULL OR story_owner_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT c.id
  INTO target_conversation_id
  FROM public.conversations c
  JOIN public.conversation_participants cp_sender
    ON cp_sender.conversation_id = c.id
   AND cp_sender.user_id = NEW.sender_id
  JOIN public.conversation_participants cp_owner
    ON cp_owner.conversation_id = c.id
   AND cp_owner.user_id = story_owner_id
  WHERE c.type = 'dm'
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF target_conversation_id IS NULL THEN
    target_conversation_id := gen_random_uuid();

    INSERT INTO public.conversations (id, type)
    VALUES (target_conversation_id, 'dm');

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES
      (target_conversation_id, NEW.sender_id),
      (target_conversation_id, story_owner_id);
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (target_conversation_id, NEW.sender_id, 'Story reply: ' || NEW.message);

  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = target_conversation_id;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_notification_for_story_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
  should_notify BOOLEAN;
BEGIN
  SELECT s.user_id
  INTO target_user
  FROM public.stories s
  WHERE s.id = NEW.story_id;

  IF target_user IS NULL OR target_user = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((us.notifications ->> 'push_messages')::BOOLEAN, p.push_messages, true)
  INTO should_notify
  FROM auth.users au
  LEFT JOIN public.user_settings us ON us.user_id = au.id
  LEFT JOIN public.profiles p ON p.user_id = au.id
  WHERE au.id = target_user;

  IF COALESCE(should_notify, true) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (
      target_user,
      NEW.sender_id,
      'story_reply',
      'Story reply',
      COALESCE(LEFT(NEW.message, 120), 'replied to your story'),
      NEW.story_id
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_story_reply_notification ON public.story_replies;
CREATE TRIGGER trg_story_reply_notification
AFTER INSERT ON public.story_replies
FOR EACH ROW EXECUTE FUNCTION public.create_notification_for_story_reply();
