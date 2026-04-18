-- 1) Add interest_category to videos
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS interest_category text;

CREATE INDEX IF NOT EXISTS idx_videos_interest_category
  ON public.videos (interest_category);

CREATE INDEX IF NOT EXISTS idx_videos_created_at_desc
  ON public.videos (created_at DESC);

-- 2) User interest affinity (auto-learned)
CREATE TABLE IF NOT EXISTS public.user_interest_affinity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  interest_category text NOT NULL,
  score real NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, interest_category)
);

CREATE INDEX IF NOT EXISTS idx_uia_user_score
  ON public.user_interest_affinity (user_id, score DESC);

ALTER TABLE public.user_interest_affinity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own affinity" ON public.user_interest_affinity;
CREATE POLICY "Users can view own affinity"
  ON public.user_interest_affinity FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own affinity" ON public.user_interest_affinity;
CREATE POLICY "Users can insert own affinity"
  ON public.user_interest_affinity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own affinity" ON public.user_interest_affinity;
CREATE POLICY "Users can update own affinity"
  ON public.user_interest_affinity FOR UPDATE
  USING (auth.uid() = user_id);

-- 3) Helper function to get top interests for a user
CREATE OR REPLACE FUNCTION public.get_user_top_interests(_user_id uuid, _limit int DEFAULT 5)
RETURNS TABLE (interest_category text, score real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT interest_category, score
  FROM public.user_interest_affinity
  WHERE user_id = _user_id
  ORDER BY score DESC
  LIMIT _limit;
$$;