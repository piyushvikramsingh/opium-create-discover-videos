-- Creator recommendation A/B experiments + exposure guardrails

CREATE TABLE IF NOT EXISTS public.creator_recommendation_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused')),
  control_weights JSONB NOT NULL DEFAULT '{"mutual": 25, "follower": 0.01, "video": 2, "recency_recent": 8, "recency_month": 3, "verified": 4}'::jsonb,
  variant_weights JSONB NOT NULL DEFAULT '{"mutual": 18, "follower": 0.02, "video": 2.5, "recency_recent": 10, "recency_month": 4, "verified": 5}'::jsonb,
  exposure_cap_per_day INTEGER NOT NULL DEFAULT 4 CHECK (exposure_cap_per_day > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_recommendation_experiments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creator recommendation experiments are readable" ON public.creator_recommendation_experiments;
CREATE POLICY "Creator recommendation experiments are readable"
ON public.creator_recommendation_experiments FOR SELECT
USING (true);
DROP TRIGGER IF EXISTS trg_creator_reco_experiments_updated_at ON public.creator_recommendation_experiments;
CREATE TRIGGER trg_creator_reco_experiments_updated_at
BEFORE UPDATE ON public.creator_recommendation_experiments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.creator_recommendation_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggested_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES public.creator_recommendation_experiments(id) ON DELETE SET NULL,
  variant TEXT,
  surface TEXT NOT NULL DEFAULT 'discover',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_recommendation_exposures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own creator recommendation exposures" ON public.creator_recommendation_exposures;
CREATE POLICY "Users can view own creator recommendation exposures"
ON public.creator_recommendation_exposures FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own creator recommendation exposures" ON public.creator_recommendation_exposures;
CREATE POLICY "Users can insert own creator recommendation exposures"
ON public.creator_recommendation_exposures FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_creator_reco_exposures_user_created
  ON public.creator_recommendation_exposures(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_reco_exposures_user_suggested_day
  ON public.creator_recommendation_exposures(user_id, suggested_user_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.get_creator_reco_experiment_variant(viewer_id UUID, experiment_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN viewer_id IS NULL OR experiment_id IS NULL THEN 'control'
    WHEN mod((('x' || substr(md5(viewer_id::text || experiment_id::text), 1, 8))::bit(32)::bigint), 2) = 0 THEN 'control'
    ELSE 'variant'
  END;
$$;
CREATE OR REPLACE FUNCTION public.get_follow_recommendations(limit_count INTEGER DEFAULT 12)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_private BOOLEAN,
  is_verified BOOLEAN,
  score DOUBLE PRECISION
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid
  ),
  active_experiment AS (
    SELECT
      cre.id,
      cre.status,
      cre.control_weights,
      cre.variant_weights,
      cre.exposure_cap_per_day,
      public.get_creator_reco_experiment_variant((SELECT uid FROM viewer), cre.id) AS variant
    FROM public.creator_recommendation_experiments cre
    WHERE cre.status = 'active'
    ORDER BY cre.updated_at DESC
    LIMIT 1
  ),
  params AS (
    SELECT
      COALESCE((ae.control_weights ->> 'mutual')::DOUBLE PRECISION, 25) AS c_mutual,
      COALESCE((ae.control_weights ->> 'follower')::DOUBLE PRECISION, 0.01) AS c_follower,
      COALESCE((ae.control_weights ->> 'video')::DOUBLE PRECISION, 2) AS c_video,
      COALESCE((ae.control_weights ->> 'recency_recent')::DOUBLE PRECISION, 8) AS c_recent,
      COALESCE((ae.control_weights ->> 'recency_month')::DOUBLE PRECISION, 3) AS c_month,
      COALESCE((ae.control_weights ->> 'verified')::DOUBLE PRECISION, 4) AS c_verified,
      COALESCE((ae.variant_weights ->> 'mutual')::DOUBLE PRECISION, 18) AS v_mutual,
      COALESCE((ae.variant_weights ->> 'follower')::DOUBLE PRECISION, 0.02) AS v_follower,
      COALESCE((ae.variant_weights ->> 'video')::DOUBLE PRECISION, 2.5) AS v_video,
      COALESCE((ae.variant_weights ->> 'recency_recent')::DOUBLE PRECISION, 10) AS v_recent,
      COALESCE((ae.variant_weights ->> 'recency_month')::DOUBLE PRECISION, 4) AS v_month,
      COALESCE((ae.variant_weights ->> 'verified')::DOUBLE PRECISION, 5) AS v_verified,
      COALESCE(ae.exposure_cap_per_day, 4) AS exposure_cap,
      COALESCE(ae.variant, 'control') AS variant
    FROM active_experiment ae
    UNION ALL
    SELECT 25, 0.01, 2, 8, 3, 4, 18, 0.02, 2.5, 10, 4, 5, 4, 'control'
    WHERE NOT EXISTS (SELECT 1 FROM active_experiment)
    LIMIT 1
  ),
  my_following AS (
    SELECT f.following_id
    FROM public.follows f
    JOIN viewer v ON v.uid IS NOT NULL AND f.follower_id = v.uid
  ),
  candidate_base AS (
    SELECT
      p.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      COALESCE(p.is_private, false) AS is_private,
      COALESCE(p.is_verified, false) AS is_verified,
      (
        SELECT COUNT(*)::DOUBLE PRECISION
        FROM public.follows ff
        WHERE ff.following_id = p.user_id
      ) AS follower_count,
      (
        SELECT COUNT(*)::DOUBLE PRECISION
        FROM public.videos vv
        WHERE vv.user_id = p.user_id
      ) AS video_count,
      (
        SELECT MAX(vv.created_at)
        FROM public.videos vv
        WHERE vv.user_id = p.user_id
      ) AS last_post_at
    FROM public.profiles p
    JOIN viewer v ON v.uid IS NOT NULL
    CROSS JOIN params prm
    WHERE p.user_id <> v.uid
      AND NOT EXISTS (
        SELECT 1
        FROM my_following mf
        WHERE mf.following_id = p.user_id
      )
      AND (
        SELECT COUNT(*)
        FROM public.creator_recommendation_exposures cre
        WHERE cre.user_id = v.uid
          AND cre.suggested_user_id = p.user_id
          AND cre.created_at >= date_trunc('day', NOW())
      ) < prm.exposure_cap
  ),
  mutuals AS (
    SELECT
      f2.following_id AS candidate_id,
      COUNT(*)::DOUBLE PRECISION AS mutual_count
    FROM public.follows f2
    JOIN my_following mf ON mf.following_id = f2.follower_id
    GROUP BY f2.following_id
  ),
  scored AS (
    SELECT
      cb.user_id,
      cb.username,
      cb.display_name,
      cb.avatar_url,
      cb.is_private,
      cb.is_verified,
      (
        COALESCE(m.mutual_count, 0) *
          CASE WHEN prm.variant = 'variant' THEN prm.v_mutual ELSE prm.c_mutual END
        + LEAST(COALESCE(cb.follower_count, 0), 5000) *
          CASE WHEN prm.variant = 'variant' THEN prm.v_follower ELSE prm.c_follower END
        + COALESCE(cb.video_count, 0) *
          CASE WHEN prm.variant = 'variant' THEN prm.v_video ELSE prm.c_video END
        + CASE
            WHEN cb.last_post_at >= NOW() - interval '7 days' THEN
              CASE WHEN prm.variant = 'variant' THEN prm.v_recent ELSE prm.c_recent END
            WHEN cb.last_post_at >= NOW() - interval '30 days' THEN
              CASE WHEN prm.variant = 'variant' THEN prm.v_month ELSE prm.c_month END
            ELSE 0
          END
        + CASE
            WHEN cb.is_verified THEN CASE WHEN prm.variant = 'variant' THEN prm.v_verified ELSE prm.c_verified END
            ELSE 0
          END
      )::DOUBLE PRECISION AS score
    FROM candidate_base cb
    LEFT JOIN mutuals m ON m.candidate_id = cb.user_id
    CROSS JOIN params prm
  )
  SELECT
    s.user_id,
    s.username,
    s.display_name,
    s.avatar_url,
    s.is_private,
    s.is_verified,
    s.score
  FROM scored s
  ORDER BY s.score DESC, s.user_id
  LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 12), 50));
$$;
CREATE OR REPLACE FUNCTION public.log_creator_recommendation_exposure_batch(
  suggested_user_ids UUID[],
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

  IF suggested_user_ids IS NULL OR array_length(suggested_user_ids, 1) IS NULL THEN
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

  INSERT INTO public.creator_recommendation_exposures (
    user_id,
    suggested_user_id,
    experiment_id,
    variant,
    surface
  )
  SELECT
    viewer_id,
    sid,
    active_experiment_id,
    active_variant,
    COALESCE(NULLIF(surface_name, ''), 'discover')
  FROM (
    SELECT DISTINCT unnest(suggested_user_ids) AS sid
  ) u
  WHERE sid IS NOT NULL
    AND sid <> viewer_id
  LIMIT 50;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_creator_recommendation_experiment_admin()
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT,
  control_weights JSONB,
  variant_weights JSONB,
  exposure_cap_per_day INTEGER,
  updated_at TIMESTAMPTZ
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
  SELECT
    cre.id,
    cre.name,
    cre.status,
    cre.control_weights,
    cre.variant_weights,
    cre.exposure_cap_per_day,
    cre.updated_at
  FROM public.creator_recommendation_experiments cre
  ORDER BY cre.updated_at DESC
  LIMIT 1;
END;
$$;
CREATE OR REPLACE FUNCTION public.upsert_creator_recommendation_experiment(
  experiment_name TEXT,
  experiment_status TEXT,
  control_weights_input JSONB,
  variant_weights_input JSONB,
  exposure_cap_input INTEGER DEFAULT 4
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id UUID := auth.uid();
  viewer_is_admin BOOLEAN := false;
  existing_id UUID;
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

  SELECT cre.id INTO existing_id
  FROM public.creator_recommendation_experiments cre
  ORDER BY cre.updated_at DESC
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.creator_recommendation_experiments (
      name,
      status,
      control_weights,
      variant_weights,
      exposure_cap_per_day
    ) VALUES (
      COALESCE(NULLIF(experiment_name, ''), 'creator_reco_default'),
      CASE WHEN experiment_status IN ('active', 'paused') THEN experiment_status ELSE 'paused' END,
      COALESCE(control_weights_input, '{"mutual": 25, "follower": 0.01, "video": 2, "recency_recent": 8, "recency_month": 3, "verified": 4}'::jsonb),
      COALESCE(variant_weights_input, '{"mutual": 18, "follower": 0.02, "video": 2.5, "recency_recent": 10, "recency_month": 4, "verified": 5}'::jsonb),
      GREATEST(1, LEAST(COALESCE(exposure_cap_input, 4), 20))
    )
    RETURNING id INTO existing_id;
  ELSE
    UPDATE public.creator_recommendation_experiments cre
    SET
      name = COALESCE(NULLIF(experiment_name, ''), cre.name),
      status = CASE WHEN experiment_status IN ('active', 'paused') THEN experiment_status ELSE cre.status END,
      control_weights = COALESCE(control_weights_input, cre.control_weights),
      variant_weights = COALESCE(variant_weights_input, cre.variant_weights),
      exposure_cap_per_day = GREATEST(1, LEAST(COALESCE(exposure_cap_input, cre.exposure_cap_per_day), 20)),
      updated_at = NOW()
    WHERE cre.id = existing_id;
  END IF;

  RETURN existing_id;
END;
$$;
-- Seed default experiment row if not present.
INSERT INTO public.creator_recommendation_experiments (name, status)
SELECT 'creator_reco_default', 'paused'
WHERE NOT EXISTS (
  SELECT 1 FROM public.creator_recommendation_experiments
);
