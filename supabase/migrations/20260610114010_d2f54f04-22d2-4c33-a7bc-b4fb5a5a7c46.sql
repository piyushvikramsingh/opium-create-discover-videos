
-- story_poll_votes
DROP POLICY IF EXISTS "Poll votes viewable by story owner" ON public.story_poll_votes;
CREATE POLICY "Poll votes viewable by owner or voter"
  ON public.story_poll_votes FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.story_stickers ss
      JOIN public.stories s ON s.id = ss.story_id
      WHERE ss.id = story_poll_votes.sticker_id AND s.user_id = auth.uid()
    )
  );

-- story_quiz_answers
DROP POLICY IF EXISTS "Quiz answers viewable" ON public.story_quiz_answers;
CREATE POLICY "Quiz answers viewable by owner or answerer"
  ON public.story_quiz_answers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.story_stickers ss
      JOIN public.stories s ON s.id = ss.story_id
      WHERE ss.id = story_quiz_answers.sticker_id AND s.user_id = auth.uid()
    )
  );

-- story_emoji_slider_votes
DROP POLICY IF EXISTS "Emoji slider votes viewable" ON public.story_emoji_slider_votes;
CREATE POLICY "Slider votes viewable by owner or voter"
  ON public.story_emoji_slider_votes FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.story_stickers ss
      JOIN public.stories s ON s.id = ss.story_id
      WHERE ss.id = story_emoji_slider_votes.sticker_id AND s.user_id = auth.uid()
    )
  );

-- story_question_responses
DROP POLICY IF EXISTS "Question responses viewable" ON public.story_question_responses;
CREATE POLICY "Question responses viewable by owner or author"
  ON public.story_question_responses FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.story_stickers ss
      JOIN public.stories s ON s.id = ss.story_id
      WHERE ss.id = story_question_responses.sticker_id AND s.user_id = auth.uid()
    )
  );

-- story_stickers: scope to parent story audience
DROP POLICY IF EXISTS "Story stickers viewable by everyone" ON public.story_stickers;
CREATE POLICY "Story stickers viewable by audience"
  ON public.story_stickers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_stickers.story_id
        AND (
          s.user_id = auth.uid()
          OR COALESCE(s.audience, 'public') = 'public'
          OR (s.audience = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = auth.uid() AND f.following_id = s.user_id
          ))
          OR (s.audience = 'close_friends' AND EXISTS (
            SELECT 1 FROM public.close_friends cf
            WHERE cf.user_id = s.user_id AND cf.friend_id = auth.uid()
          ))
        )
    )
  );

-- story_highlight_items: require sign-in (highlights themselves are public via profile_highlights)
DROP POLICY IF EXISTS "Highlight items viewable by everyone" ON public.story_highlight_items;
CREATE POLICY "Highlight items viewable by authenticated"
  ON public.story_highlight_items FOR SELECT
  TO authenticated
  USING (true);
