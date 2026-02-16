
-- Fix infinite recursion in conversation_participants SELECT policy
DROP POLICY IF EXISTS "Users can view participants of own conversations" ON public.conversation_participants;

-- Security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.user_is_in_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Users can view participants of own conversations"
ON public.conversation_participants
FOR SELECT
USING (
  public.user_is_in_conversation(conversation_id)
);
