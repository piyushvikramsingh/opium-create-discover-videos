
-- Stories table
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  thumbnail_url TEXT,
  caption TEXT,
  background_color TEXT,
  duration INTEGER NOT NULL DEFAULT 5,
  audience TEXT NOT NULL DEFAULT 'followers',
  view_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories viewable by everyone" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Users can insert own stories" ON public.stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories" ON public.stories FOR DELETE USING (auth.uid() = user_id);

-- Story views table
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story views viewable by story owner" ON public.story_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stories WHERE stories.id = story_views.story_id AND stories.user_id = auth.uid())
  OR viewer_id = auth.uid()
);
CREATE POLICY "Users can insert own views" ON public.story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- Story replies table
CREATE TABLE public.story_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.story_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story replies viewable by story owner" ON public.story_replies FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stories WHERE stories.id = story_replies.story_id AND stories.user_id = auth.uid())
  OR sender_id = auth.uid()
);
CREATE POLICY "Users can insert own replies" ON public.story_replies FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Close friends table
CREATE TABLE public.close_friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own close friends" ON public.close_friends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add close friends" ON public.close_friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove close friends" ON public.close_friends FOR DELETE USING (auth.uid() = user_id);

-- Function to increment story view count
CREATE OR REPLACE FUNCTION public.increment_story_view_count(story_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stories SET view_count = view_count + 1 WHERE id = story_id;
END;
$$;

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
