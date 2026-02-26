-- Backend enforcement for newly added settings controls in Settings UI.
-- 1) Backfill default JSON keys in user_settings.
-- 2) Enforce typing indicator preference on typing_status writes.
-- 3) Enforce read receipt preference on message seen/viewed updates.
-- 4) Respect message preview preference in message notifications.

-- Backfill defaults for settings keys introduced in Settings tab.
UPDATE public.user_settings
SET
  interactions = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(interactions, '{}'::jsonb),
        '{message_preview}',
        COALESCE(interactions -> 'message_preview', 'true'::jsonb),
        true
      ),
      '{read_receipts}',
      COALESCE(interactions -> 'read_receipts', 'true'::jsonb),
      true
    ),
    '{typing_indicators}',
    COALESCE(interactions -> 'typing_indicators', 'true'::jsonb),
    true
  ),
  app = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(app, '{}'::jsonb),
        '{autoplay_videos}',
        COALESCE(app -> 'autoplay_videos', 'true'::jsonb),
        true
      ),
      '{autoplay_sound}',
      COALESCE(app -> 'autoplay_sound', 'false'::jsonb),
      true
    ),
    '{loop_videos}',
    COALESCE(app -> 'loop_videos', 'true'::jsonb),
    true
  );

CREATE OR REPLACE FUNCTION public.enforce_typing_indicator_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  typing_enabled BOOLEAN;
BEGIN
  IF NEW.is_typing THEN
    SELECT COALESCE((us.interactions ->> 'typing_indicators')::BOOLEAN, true)
    INTO typing_enabled
    FROM public.user_settings us
    WHERE us.user_id = NEW.user_id;

    IF COALESCE(typing_enabled, true) = false THEN
      NEW.is_typing := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_typing_status_enforce_preference ON public.typing_status;
CREATE TRIGGER trg_typing_status_enforce_preference
BEFORE INSERT OR UPDATE ON public.typing_status
FOR EACH ROW
EXECUTE FUNCTION public.enforce_typing_indicator_preference();

CREATE OR REPLACE FUNCTION public.enforce_read_receipt_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  read_receipts_enabled BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.is_snap = false
    AND OLD.sender_id IS DISTINCT FROM auth.uid()
    AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.viewed IS DISTINCT FROM OLD.viewed)
  THEN
    SELECT COALESCE((us.interactions ->> 'read_receipts')::BOOLEAN, true)
    INTO read_receipts_enabled
    FROM public.user_settings us
    WHERE us.user_id = auth.uid();

    IF COALESCE(read_receipts_enabled, true) = false THEN
      IF NEW.status = 'seen' THEN
        NEW.status := OLD.status;
      END IF;
      IF NEW.viewed IS TRUE AND OLD.viewed IS DISTINCT FROM TRUE THEN
        NEW.viewed := OLD.viewed;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_enforce_read_receipts ON public.messages;
CREATE TRIGGER trg_messages_enforce_read_receipts
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_read_receipt_preference();

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
    CASE
      WHEN COALESCE((us.interactions ->> 'message_preview')::BOOLEAN, true)
        THEN COALESCE(LEFT(NEW.content, 120), 'sent you a message')
      ELSE 'sent you a message'
    END,
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
