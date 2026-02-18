-- Profile feature expansion for Instagram-like profile capabilities

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_last_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS professional_account BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_url TEXT,
  ADD COLUMN IF NOT EXISTS shop_url TEXT;

UPDATE public.profiles
SET last_active_at = COALESCE(last_active_at, now());

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_videos_user_id_pinned ON public.videos(user_id, is_pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follow requests visible to participants" ON public.follow_requests;
CREATE POLICY "Follow requests visible to participants"
ON public.follow_requests FOR SELECT
USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "Users can create own follow request" ON public.follow_requests;
CREATE POLICY "Users can create own follow request"
ON public.follow_requests FOR INSERT
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Follower can cancel own request" ON public.follow_requests;
CREATE POLICY "Follower can cancel own request"
ON public.follow_requests FOR DELETE
USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Target user can update request" ON public.follow_requests;
CREATE POLICY "Target user can update request"
ON public.follow_requests FOR UPDATE
USING (auth.uid() = following_id);

CREATE TABLE IF NOT EXISTS public.profile_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  story_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Highlights are viewable by everyone" ON public.profile_highlights;
CREATE POLICY "Highlights are viewable by everyone"
ON public.profile_highlights FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert own highlights" ON public.profile_highlights;
CREATE POLICY "Users can insert own highlights"
ON public.profile_highlights FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own highlights" ON public.profile_highlights;
CREATE POLICY "Users can update own highlights"
ON public.profile_highlights FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own highlights" ON public.profile_highlights;
CREATE POLICY "Users can delete own highlights"
ON public.profile_highlights FOR DELETE
USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.tagged_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

ALTER TABLE public.tagged_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tagged videos are viewable by everyone" ON public.tagged_videos;
CREATE POLICY "Tagged videos are viewable by everyone"
ON public.tagged_videos FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can tag themselves" ON public.tagged_videos;
CREATE POLICY "Users can tag themselves"
ON public.tagged_videos FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own tags" ON public.tagged_videos;
CREATE POLICY "Users can remove own tags"
ON public.tagged_videos FOR DELETE
USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.profile_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'custom' CHECK (link_type IN ('custom', 'affiliate', 'shop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile links are viewable by everyone" ON public.profile_links;
CREATE POLICY "Profile links are viewable by everyone"
ON public.profile_links FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert own profile links" ON public.profile_links;
CREATE POLICY "Users can insert own profile links"
ON public.profile_links FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile links" ON public.profile_links;
CREATE POLICY "Users can update own profile links"
ON public.profile_links FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own profile links" ON public.profile_links;
CREATE POLICY "Users can delete own profile links"
ON public.profile_links FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_follow_requests_following_status ON public.follow_requests(following_id, status);
CREATE INDEX IF NOT EXISTS idx_tagged_videos_user_id ON public.tagged_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_highlights_user_id ON public.profile_highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_links_user_id ON public.profile_links(user_id);

-- Update timestamps
CREATE OR REPLACE FUNCTION public.update_follow_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_requests_updated_at ON public.follow_requests;
CREATE TRIGGER trg_follow_requests_updated_at
BEFORE UPDATE ON public.follow_requests
FOR EACH ROW EXECUTE FUNCTION public.update_follow_requests_updated_at();

DROP TRIGGER IF EXISTS trg_profile_highlights_updated_at ON public.profile_highlights;
CREATE TRIGGER trg_profile_highlights_updated_at
BEFORE UPDATE ON public.profile_highlights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profile_links_updated_at ON public.profile_links;
CREATE TRIGGER trg_profile_links_updated_at
BEFORE UPDATE ON public.profile_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
