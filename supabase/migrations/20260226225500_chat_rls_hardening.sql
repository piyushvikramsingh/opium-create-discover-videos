-- Harden participant insertion to self or current conversation members only.
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;
CREATE POLICY "Users can add participants"
ON public.conversation_participants FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
    )
  )
);

-- Remove broad reaction policies and enforce conversation-scoped access.
DROP POLICY IF EXISTS "Users can view message reactions in conversations" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can react as self" ON public.message_reactions;
DROP POLICY IF EXISTS "Reactions viewable by conversation participants" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert own reactions" ON public.message_reactions;

CREATE POLICY "Reactions viewable by conversation participants"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
);
