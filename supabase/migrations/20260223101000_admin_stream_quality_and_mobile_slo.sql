-- Admin diagnostics for stream quality and mobile performance SLOs

CREATE OR REPLACE FUNCTION public.get_stream_quality_admin_issues(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  video_id UUID,
  user_id UUID,
  creator_username TEXT,
  stream_status TEXT,
  stream_quality_status TEXT,
  stream_error TEXT,
  quality_reasons JSONB,
  quality_checks JSONB,
  created_at TIMESTAMPTZ,
  quality_checked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(limit_count, 100), 1), 500);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    v.id AS video_id,
    v.user_id,
    p.username AS creator_username,
    v.stream_status,
    COALESCE(v.stream_quality_status, 'unknown') AS stream_quality_status,
    v.stream_error,
    COALESCE(v.stream_quality->'reasons', '[]'::jsonb) AS quality_reasons,
    COALESCE(v.stream_quality->'checks', '{}'::jsonb) AS quality_checks,
    v.created_at,
    v.stream_quality_checked_at AS quality_checked_at
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  WHERE COALESCE(v.stream_quality_status, 'unknown') IN ('warn', 'fail')
     OR v.stream_status = 'failed'
  ORDER BY v.created_at DESC
  LIMIT bounded_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_stream_quality_admin_issues(INTEGER) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_mobile_perf_slo_summary(window_days INTEGER DEFAULT 7)
RETURNS TABLE (
  platform TEXT,
  network_tier TEXT,
  events_count BIGINT,
  sessions_count BIGINT,
  startup_samples BIGINT,
  startup_p50_ms NUMERIC,
  startup_p95_ms NUMERIC,
  rebuffer_samples BIGINT,
  avg_rebuffer_ms NUMERIC,
  slow_frame_samples BIGINT,
  avg_slow_frame_pct NUMERIC,
  computed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  bounded_days INTEGER := LEAST(GREATEST(COALESCE(window_days, 7), 1), 60);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT *
    FROM public.mobile_perf_events e
    WHERE e.created_at >= now() - make_interval(days => bounded_days)
  )
  SELECT
    COALESCE(NULLIF(f.platform, ''), 'unknown') AS platform,
    COALESCE(NULLIF(f.network_tier, ''), 'unknown') AS network_tier,
    COUNT(*)::BIGINT AS events_count,
    COUNT(DISTINCT f.device_session_id)::BIGINT AS sessions_count,
    COUNT(f.startup_ms)::BIGINT AS startup_samples,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY f.startup_ms) FILTER (WHERE f.startup_ms IS NOT NULL)::NUMERIC AS startup_p50_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY f.startup_ms) FILTER (WHERE f.startup_ms IS NOT NULL)::NUMERIC AS startup_p95_ms,
    COUNT(f.rebuffer_ms)::BIGINT AS rebuffer_samples,
    AVG(f.rebuffer_ms)::NUMERIC AS avg_rebuffer_ms,
    COUNT(f.slow_frame_pct)::BIGINT AS slow_frame_samples,
    AVG(f.slow_frame_pct)::NUMERIC AS avg_slow_frame_pct,
    now() AS computed_at
  FROM filtered f
  GROUP BY 1, 2
  ORDER BY events_count DESC, platform, network_tier;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_mobile_perf_slo_summary(INTEGER) TO authenticated;
