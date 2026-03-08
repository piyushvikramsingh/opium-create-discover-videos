
-- Story Highlights: profile_highlights table for persistent highlights
CREATE TABLE IF NOT EXISTS public.profile_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlights viewable by everyone" ON public.profile_highlights FOR SELECT USING (true);
CREATE POLICY "Users can insert own highlights" ON public.profile_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own highlights" ON public.profile_highlights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own highlights" ON public.profile_highlights FOR DELETE USING (auth.uid() = user_id);

-- Story highlight items: links stories to highlights (persists beyond 24h)
CREATE TABLE IF NOT EXISTS public.story_highlight_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES public.profile_highlights(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(highlight_id, story_id)
);

ALTER TABLE public.story_highlight_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlight items viewable by everyone" ON public.story_highlight_items FOR SELECT USING (true);
CREATE POLICY "Users can add to own highlights" ON public.story_highlight_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profile_highlights WHERE id = highlight_id AND user_id = auth.uid())
);
CREATE POLICY "Users can remove from own highlights" ON public.story_highlight_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profile_highlights WHERE id = highlight_id AND user_id = auth.uid())
);

-- Typing status table for real-time typing indicators
CREATE TABLE IF NOT EXISTS public.typing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_typing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view typing in own conversations" ON public.typing_status FOR SELECT
  USING (public.user_is_in_conversation(conversation_id));
CREATE POLICY "Users can upsert own typing status" ON public.typing_status FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.user_is_in_conversation(conversation_id));
CREATE POLICY "Users can update own typing status" ON public.typing_status FOR UPDATE
  USING (auth.uid() = user_id);

-- Message reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions in own conversations" ON public.message_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.user_is_in_conversation(m.conversation_id)
  ));
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions" ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for typing_status and message_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
