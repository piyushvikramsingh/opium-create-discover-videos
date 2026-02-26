-- Bridge story replies into DMs and harden story RLS policies.

DROP POLICY IF EXISTS "Users can insert own story views" ON public.story_views;
CREATE POLICY "Users can insert own story views"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);
DROP POLICY IF EXISTS "Users can view own and own-story views" ON public.story_views;
CREATE POLICY "Users can view own and own-story views"
ON public.story_views FOR SELECT
USING (
  viewer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = story_views.story_id
      AND s.user_id = auth.uid()
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
  )
);
DROP POLICY IF EXISTS "Users can view sent and received story replies" ON public.story_replies;
CREATE POLICY "Users can view sent and received story replies"
ON public.story_replies FOR SELECT
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = story_replies.story_id
      AND s.user_id = auth.uid()
  )
);
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
  VALUES (target_conversation_id, NEW.sender_id, NEW.message);

  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = target_conversation_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bridge_story_reply_to_dm ON public.story_replies;
CREATE TRIGGER trg_bridge_story_reply_to_dm
AFTER INSERT ON public.story_replies
FOR EACH ROW EXECUTE FUNCTION public.bridge_story_reply_to_dm();
