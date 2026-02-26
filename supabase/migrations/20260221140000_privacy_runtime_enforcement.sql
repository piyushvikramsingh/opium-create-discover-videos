-- Server-side runtime enforcement for mentions/comments/messages privacy

CREATE OR REPLACE FUNCTION public.extract_mentioned_usernames(input_text TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT LOWER(match[1])),
    ARRAY[]::TEXT[]
  )
  FROM regexp_matches(COALESCE(input_text, ''), '@([A-Za-z0-9_.]+)', 'g') AS match;
$$;
CREATE OR REPLACE FUNCTION public.assert_mentions_allowed(input_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked_mentions TEXT[];
BEGIN
  SELECT COALESCE(array_agg('@' || p.username), ARRAY[]::TEXT[])
  INTO blocked_mentions
  FROM public.profiles p
  WHERE LOWER(p.username) = ANY(public.extract_mentioned_usernames(input_text))
    AND p.allow_mentions = false;

  IF COALESCE(array_length(blocked_mentions, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Mentions are restricted for: %', array_to_string(blocked_mentions, ', ');
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_video_privacy_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_mentions_allowed(NEW.description);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_video_privacy_rules ON public.videos;
CREATE TRIGGER trg_enforce_video_privacy_rules
BEFORE INSERT OR UPDATE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_video_privacy_rules();
CREATE OR REPLACE FUNCTION public.enforce_comment_privacy_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_user_id UUID;
  owner_allow_comments BOOLEAN;
BEGIN
  SELECT v.user_id
  INTO owner_user_id
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Video not found for comment';
  END IF;

  SELECT COALESCE(p.allow_comments, true)
  INTO owner_allow_comments
  FROM public.profiles p
  WHERE p.user_id = owner_user_id;

  IF owner_allow_comments = false AND NEW.user_id <> owner_user_id THEN
    RAISE EXCEPTION 'This creator has turned off comments';
  END IF;

  PERFORM public.assert_mentions_allowed(NEW.content);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_comment_privacy_rules ON public.comments;
CREATE TRIGGER trg_enforce_comment_privacy_rules
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_privacy_rules();
CREATE OR REPLACE FUNCTION public.enforce_message_privacy_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient RECORD;
  recipient_policy TEXT;
  follows_recipient BOOLEAN;
BEGIN
  PERFORM public.assert_mentions_allowed(NEW.content);

  FOR recipient IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id <> NEW.sender_id
  LOOP
    SELECT COALESCE(p.allow_messages_from, 'everyone')
    INTO recipient_policy
    FROM public.profiles p
    WHERE p.user_id = recipient.user_id;

    recipient_policy := COALESCE(recipient_policy, 'everyone');

    IF recipient_policy = 'none' THEN
      RAISE EXCEPTION 'This user is not accepting new messages';
    END IF;

    IF recipient_policy = 'following' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.follows f
        WHERE f.follower_id = NEW.sender_id
          AND f.following_id = recipient.user_id
      ) INTO follows_recipient;

      IF NOT follows_recipient THEN
        RAISE EXCEPTION 'You can message this user only after following';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_message_privacy_rules ON public.messages;
CREATE TRIGGER trg_enforce_message_privacy_rules
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_privacy_rules();
