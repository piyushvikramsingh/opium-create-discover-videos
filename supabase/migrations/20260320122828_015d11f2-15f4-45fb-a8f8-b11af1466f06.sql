
-- Story stickers table
CREATE TABLE public.story_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  sticker_type text NOT NULL,
  position_x real NOT NULL DEFAULT 0.5,
  position_y real NOT NULL DEFAULT 0.5,
  rotation real NOT NULL DEFAULT 0,
  scale real NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.story_stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Story stickers viewable by everyone" ON public.story_stickers FOR SELECT USING (true);
CREATE POLICY "Users can insert stickers on own stories" ON public.story_stickers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stories WHERE id = story_stickers.story_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete stickers on own stories" ON public.story_stickers FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stories WHERE id = story_stickers.story_id AND user_id = auth.uid())
);

-- Poll votes
CREATE TABLE public.story_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.story_stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sticker_id, user_id)
);
ALTER TABLE public.story_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Poll votes viewable by story owner" ON public.story_poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote on polls" ON public.story_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Quiz answers
CREATE TABLE public.story_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.story_stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  selected_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sticker_id, user_id)
);
ALTER TABLE public.story_quiz_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quiz answers viewable" ON public.story_quiz_answers FOR SELECT USING (true);
CREATE POLICY "Users can answer quizzes" ON public.story_quiz_answers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Question responses
CREATE TABLE public.story_question_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.story_stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.story_question_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Question responses viewable" ON public.story_question_responses FOR SELECT USING (true);
CREATE POLICY "Users can respond to questions" ON public.story_question_responses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Emoji slider votes
CREATE TABLE public.story_emoji_slider_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.story_stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  value real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sticker_id, user_id)
);
ALTER TABLE public.story_emoji_slider_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Emoji slider votes viewable" ON public.story_emoji_slider_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote on emoji sliders" ON public.story_emoji_slider_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Story archive
CREATE TABLE public.story_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  original_story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  thumbnail_url text,
  caption text,
  background_color text,
  duration integer NOT NULL DEFAULT 5,
  audience text NOT NULL DEFAULT 'followers',
  stickers jsonb DEFAULT '[]'::jsonb,
  original_created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.story_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own archive" ON public.story_archive FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own archive" ON public.story_archive FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own archive" ON public.story_archive FOR DELETE USING (auth.uid() = user_id);

-- Music tracks library
CREATE TABLE public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text NOT NULL,
  genre text DEFAULT 'pop',
  preview_url text,
  duration_seconds integer DEFAULT 30,
  cover_url text,
  is_trending boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Music tracks viewable by everyone" ON public.music_tracks FOR SELECT USING (true);
