
DROP POLICY IF EXISTS "Highlight items viewable by authenticated" ON public.story_highlight_items;
CREATE POLICY "Highlight items viewable by audience"
  ON public.story_highlight_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_highlights ph
      WHERE ph.id = story_highlight_items.highlight_id
        AND (
          ph.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.stories s
            WHERE s.id = story_highlight_items.story_id
              AND (
                COALESCE(s.audience, 'public') = 'public'
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
          OR EXISTS (
            SELECT 1 FROM public.story_archive sa
            WHERE sa.id = story_highlight_items.story_id
              AND (
                COALESCE(sa.audience, 'public') = 'public'
                OR (sa.audience = 'followers' AND EXISTS (
                  SELECT 1 FROM public.follows f
                  WHERE f.follower_id = auth.uid() AND f.following_id = sa.user_id
                ))
                OR (sa.audience = 'close_friends' AND EXISTS (
                  SELECT 1 FROM public.close_friends cf
                  WHERE cf.user_id = sa.user_id AND cf.friend_id = auth.uid()
                ))
              )
          )
        )
    )
  );
