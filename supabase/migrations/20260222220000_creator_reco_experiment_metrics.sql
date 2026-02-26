-- Creator recommendation experiment metrics (CTR, follow conversion, cap-hit)

CREATE TABLE IF NOT EXISTS public.creator_recommendation_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggested_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES public.creator_recommendation_experiments(id) ON DELETE SET NULL,
  variant TEXT,
  surface TEXT NOT NULL DEFAULT 'discover',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_recommendation_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own creator recommendation clicks" ON public.creator_recommendation_clicks;
CREATE POLICY "Users can view own creator recommendation clicks"
ON public.creator_recommendation_clicks FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own creator recommendation clicks" ON public.creator_recommendation_clicks;
CREATE POLICY "Users can insert own creator recommendation clicks"
ON public.creator_recommendation_clicks FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_creator_reco_clicks_user_created
  ON public.creator_recommendation_clicks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_reco_clicks_suggested_created
  ON public.creator_recommendation_clicks(suggested_user_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.log_creator_recommendation_click(
  suggested_user_id_input UUID,
  surface_name TEXT DEFAULT 'discover'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  viewer_id UUID := auth.uid();
  active_experiment_id UUID := NULL;
  active_variant TEXT := 'control';
BEGIN
  IF viewer_id IS NULL THEN
    RETURN;
  END IF;

  IF suggested_user_id_input IS NULL OR suggested_user_id_input = viewer_id THEN
    RETURN;
  END IF;

  SELECT
    cre.id,
    public.get_creator_reco_experiment_variant(viewer_id, cre.id)
  INTO active_experiment_id, active_variant
  FROM public.creator_recommendation_experiments cre
  WHERE cre.status = 'active'
  ORDER BY cre.updated_at DESC
  LIMIT 1;

  INSERT INTO public.creator_recommendation_clicks (
    user_id,
    suggested_user_id,
    experiment_id,
    variant,
    surface
  ) VALUES (
    viewer_id,
    suggested_user_id_input,
    active_experiment_id,
    active_variant,
    COALESCE(NULLIF(surface_name, ''), 'discover')
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_creator_recommendation_experiment_metrics(window_days INTEGER DEFAULT 7)
RETURNS TABLE (
  variant TEXT,
  exposures BIGINT,
  unique_exposed_users BIGINT,
  clicks BIGINT,
  ctr_percent DOUBLE PRECISION,
  follow_conversions BIGINT,
  follow_conversion_percent DOUBLE PRECISION,
  cap_hit_rate_percent DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  viewer_id UUID := auth.uid();
  viewer_is_admin BOOLEAN := false;
BEGIN
  IF viewer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(p.is_admin, false)
  INTO viewer_is_admin
  FROM public.profiles p
  WHERE p.user_id = viewer_id;

  IF NOT viewer_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH active_cfg AS (
    SELECT COALESCE(cre.exposure_cap_per_day, 4) AS exposure_cap_per_day
    FROM public.creator_recommendation_experiments cre
    ORDER BY cre.updated_at DESC
    LIMIT 1
  ), exp AS (
    SELECT
      COALESCE(e.variant, 'control') AS variant,
      e.id,
      e.user_id,
      e.suggested_user_id,
      e.created_at
    FROM public.creator_recommendation_exposures e
    WHERE e.created_at >= NOW() - make_interval(days => GREATEST(1, LEAST(COALESCE(window_days, 7), 90)))
  ), clk AS (
    SELECT
      COALESCE(c.variant, 'control') AS variant,
      c.id,
      c.user_id,
      c.suggested_user_id,
      c.created_at
    FROM public.creator_recommendation_clicks c
    WHERE c.created_at >= NOW() - make_interval(days => GREATEST(1, LEAST(COALESCE(window_days, 7), 90)))
  ), conv AS (
    SELECT DISTINCT
      e.variant,
      e.user_id,
      e.suggested_user_id
    FROM exp e
    JOIN public.follows f
      ON f.follower_id = e.user_id
     AND f.following_id = e.suggested_user_id
     AND f.created_at >= e.created_at
     AND f.created_at <= e.created_at + interval '7 days'
  ), cap_pairs AS (
    SELECT
      e.variant,
      e.user_id,
      e.suggested_user_id,
      COUNT(*) AS shown_count
    FROM exp e
    GROUP BY e.variant, e.user_id, e.suggested_user_id
  ), aggregate_base AS (
    SELECT
      v.variant,
      COUNT(e.id) AS exposures,
      COUNT(DISTINCT e.user_id) AS unique_exposed_users,
      COUNT(c.id) AS clicks,
      COUNT(DISTINCT (conv.user_id::text || ':' || conv.suggested_user_id::text)) AS follow_conversions,
      COUNT(DISTINCT (cp.user_id::text || ':' || cp.suggested_user_id::text)) AS total_pairs,
      COUNT(DISTINCT CASE
        WHEN cp.shown_count >= COALESCE((SELECT exposure_cap_per_day FROM active_cfg), 4)
        THEN (cp.user_id::text || ':' || cp.suggested_user_id::text)
        ELSE NULL
      END) AS cap_hit_pairs
    FROM (
      SELECT DISTINCT variant FROM exp
      UNION
      SELECT DISTINCT variant FROM clk
      UNION
      SELECT DISTINCT variant FROM conv
    ) v
    LEFT JOIN exp e ON e.variant = v.variant
    LEFT JOIN clk c ON c.variant = v.variant
    LEFT JOIN conv ON conv.variant = v.variant
    LEFT JOIN cap_pairs cp ON cp.variant = v.variant
    GROUP BY v.variant
  )
  SELECT
    ab.variant,
    ab.exposures,
    ab.unique_exposed_users,
    ab.clicks,
    CASE WHEN ab.exposures > 0 THEN (ab.clicks::DOUBLE PRECISION / ab.exposures) * 100 ELSE 0 END AS ctr_percent,
    ab.follow_conversions,
    CASE WHEN ab.exposures > 0 THEN (ab.follow_conversions::DOUBLE PRECISION / ab.exposures) * 100 ELSE 0 END AS follow_conversion_percent,
    CASE WHEN ab.total_pairs > 0 THEN (ab.cap_hit_pairs::DOUBLE PRECISION / ab.total_pairs) * 100 ELSE 0 END AS cap_hit_rate_percent
  FROM aggregate_base ab
  ORDER BY CASE WHEN ab.variant = 'control' THEN 0 ELSE 1 END, ab.variant;
END;
$$;
