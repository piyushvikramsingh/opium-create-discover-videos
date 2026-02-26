-- Add message-request notification type and trigger logic that distinguishes request DMs.

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
    'comment',
    'reply',
    'like',
    'save',
    'recap',
    'reengage'
  ));
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
    CASE
      WHEN is_request THEN 'message_request'
      WHEN NEW.reply_to_message_id IS NULL THEN 'message'
      ELSE 'reply'
    END,
    CASE
      WHEN is_request THEN 'Message request'
      WHEN NEW.reply_to_message_id IS NULL THEN 'New message'
      ELSE 'New reply'
    END,
    CASE
      WHEN is_request THEN COALESCE(LEFT(NEW.content, 120), 'sent you a message request')
      ELSE COALESCE(LEFT(NEW.content, 120), 'sent you a message')
    END,
    NEW.conversation_id
  FROM public.conversation_participants cp
  LEFT JOIN public.user_settings us ON us.user_id = cp.user_id
  LEFT JOIN public.profiles p ON p.user_id = cp.user_id
  LEFT JOIN LATERAL (
    SELECT
      (
        NOT EXISTS (
          SELECT 1
          FROM public.follows f
          WHERE f.follower_id = cp.user_id
            AND f.following_id = NEW.sender_id
        )
        AND NOT COALESCE((
          SELECT cs.accepted_request
          FROM public.conversation_settings cs
          WHERE cs.conversation_id = NEW.conversation_id
            AND cs.user_id = cp.user_id
          LIMIT 1
        ), false)
        AND NOT EXISTS (
          SELECT 1
          FROM public.messages m
          WHERE m.conversation_id = NEW.conversation_id
            AND m.sender_id = cp.user_id
        )
      ) AS is_request
  ) request_state ON TRUE
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
    AND (
      (request_state.is_request AND COALESCE((us.notifications ->> 'push_message_requests')::BOOLEAN, true))
      OR
      (NOT request_state.is_request AND COALESCE((us.notifications ->> 'push_messages')::BOOLEAN, p.push_messages, true))
    );

  RETURN NEW;
END;
$$;
