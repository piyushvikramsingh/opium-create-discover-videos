-- Feed ranking telemetry for For You experimentation and quality monitoring

CREATE TABLE IF NOT EXISTS public.feed_ranking_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  surface TEXT NOT NULL DEFAULT 'for_you',
  rank_position INTEGER NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rank_position > 0)
);
CREATE INDEX IF NOT EXISTS idx_feed_ranking_telemetry_user_created
  ON public.feed_ranking_telemetry(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_ranking_telemetry_surface_created
  ON public.feed_ranking_telemetry(surface, created_at DESC);
ALTER TABLE public.feed_ranking_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feed ranking telemetry" ON public.feed_ranking_telemetry;
CREATE POLICY "Users can view own feed ranking telemetry"
ON public.feed_ranking_telemetry FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feed ranking telemetry" ON public.feed_ranking_telemetry;
CREATE POLICY "Users can insert own feed ranking telemetry"
ON public.feed_ranking_telemetry FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.log_for_you_ranking_batch(
  rows_payload JSONB,
  surface_name TEXT DEFAULT 'for_you'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  viewer_id UUID := auth.uid();
BEGIN
  IF viewer_id IS NULL THEN
    RETURN;
  END IF;

  IF rows_payload IS NULL OR jsonb_typeof(rows_payload) <> 'array' THEN
    RETURN;
  END IF;

  INSERT INTO public.feed_ranking_telemetry (
    user_id,
    video_id,
    surface,
    rank_position,
    score,
    components
  )
  SELECT
    viewer_id,
    (row_item->>'video_id')::UUID,
    COALESCE(NULLIF(surface_name, ''), 'for_you'),
    GREATEST(1, COALESCE((row_item->>'rank_position')::INTEGER, 1)),
    COALESCE((row_item->>'score')::DOUBLE PRECISION, 0),
    COALESCE(row_item->'components', '{}'::jsonb)
  FROM jsonb_array_elements(rows_payload) row_item
  WHERE row_item ? 'video_id'
    AND row_item ? 'score'
    AND (row_item->>'video_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  LIMIT 100;
END;
$$;
