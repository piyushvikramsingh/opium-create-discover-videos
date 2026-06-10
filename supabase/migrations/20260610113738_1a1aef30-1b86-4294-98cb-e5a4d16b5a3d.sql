
-- 1) Inbox notes: restrict to owner + followed users
DROP POLICY IF EXISTS "Notes viewable by authenticated" ON public.inbox_notes;
DROP POLICY IF EXISTS "Users can view own and followed inbox notes" ON public.inbox_notes;
CREATE POLICY "Users can view own and followed inbox notes"
  ON public.inbox_notes FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid() AND f.following_id = inbox_notes.user_id
    )
  );

-- 2) Stories: respect audience
DROP POLICY IF EXISTS "Stories viewable by everyone" ON public.stories;
DROP POLICY IF EXISTS "Stories viewable by audience" ON public.stories;
CREATE POLICY "Stories viewable by audience"
  ON public.stories FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      COALESCE(audience, 'public') = 'public'
    )
    OR (
      audience = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = auth.uid() AND f.following_id = stories.user_id
      )
    )
    OR (
      audience = 'close_friends' AND EXISTS (
        SELECT 1 FROM public.close_friends cf
        WHERE cf.user_id = stories.user_id AND cf.friend_id = auth.uid()
      )
    )
  );

-- 3) Counter underflow guards
CREATE OR REPLACE FUNCTION public.handle_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = comments_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_bookmark_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET bookmarks_count = GREATEST(0, bookmarks_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
END;
$function$;
