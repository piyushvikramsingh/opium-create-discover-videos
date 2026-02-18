-- Chat feature expansion: reactions, replies/edit/delete metadata, typing presence, and per-user conversation settings

-- Extend messages for richer chat features
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'seen', 'failed'));

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id);

-- Message reactions (one reaction per user per message)
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

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
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own reactions"
ON public.message_reactions FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own reactions"
ON public.message_reactions FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);

-- Per-user conversation settings (pin/mute/archive)
CREATE TABLE IF NOT EXISTS public.conversation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT false,
  muted BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation settings"
ON public.conversation_settings FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own conversation settings"
ON public.conversation_settings FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversation settings"
ON public.conversation_settings FOR UPDATE
USING (user_id = auth.uid());

CREATE TRIGGER update_conversation_settings_updated_at
BEFORE UPDATE ON public.conversation_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Typing status for real-time typing indicator
CREATE TABLE IF NOT EXISTS public.typing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view typing in own conversations"
ON public.typing_status FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = typing_status.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own typing status"
ON public.typing_status FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = typing_status.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own typing status"
ON public.typing_status FOR UPDATE
USING (user_id = auth.uid());

CREATE TRIGGER update_typing_status_updated_at
BEFORE UPDATE ON public.typing_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime support for added tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;
