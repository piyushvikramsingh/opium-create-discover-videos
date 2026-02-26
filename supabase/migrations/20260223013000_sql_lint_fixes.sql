-- SQL lint fixes for formatting and ambiguous identifier references.

CREATE OR REPLACE FUNCTION public.get_message_request_alerts(
  window_days INTEGER DEFAULT 7,
  delete_rate_threshold_percent NUMERIC DEFAULT 70,
  min_actions INTEGER DEFAULT 20
)
RETURNS TABLE (
  warning_level TEXT,
  message TEXT,
  total_actions BIGINT,
  accept_actions BIGINT,
  delete_actions BIGINT,
  accept_rate_percent NUMERIC,
  delete_rate_percent NUMERIC,
  threshold_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  metrics_row RECORD;
  bounded_threshold NUMERIC;
  bounded_min_actions INTEGER;
  computed_delete_rate NUMERIC;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  bounded_threshold := GREATEST(10, LEAST(COALESCE(delete_rate_threshold_percent, 70), 95));
  bounded_min_actions := GREATEST(1, LEAST(COALESCE(min_actions, 20), 500));

  SELECT *
  INTO metrics_row
  FROM public.get_message_request_admin_metrics(window_days)
  LIMIT 1;

  IF metrics_row IS NULL THEN
    RETURN QUERY
    SELECT
      'info'::TEXT,
      'No message request actions yet.'::TEXT,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      0::NUMERIC,
      0::NUMERIC,
      bounded_threshold;
    RETURN;
  END IF;

  computed_delete_rate := GREATEST(0, 100 - COALESCE(metrics_row.accept_rate_percent, 0));

  IF COALESCE(metrics_row.total_actions, 0) < bounded_min_actions THEN
    RETURN QUERY
    SELECT
      'info'::TEXT,
      format('Collecting signal: %s actions so far (minimum %s needed).', COALESCE(metrics_row.total_actions, 0), bounded_min_actions),
      COALESCE(metrics_row.total_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_actions, 0)::BIGINT,
      COALESCE(metrics_row.delete_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_rate_percent, 0)::NUMERIC,
      computed_delete_rate::NUMERIC,
      bounded_threshold;
    RETURN;
  END IF;

  IF computed_delete_rate >= bounded_threshold + 15 THEN
    RETURN QUERY
    SELECT
      'critical'::TEXT,
      format(
        'Critical: message request delete rate %s%% exceeds threshold %s%%.',
        to_char(computed_delete_rate, 'FM999990.00'),
        to_char(bounded_threshold, 'FM999990.00')
      ),
      COALESCE(metrics_row.total_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_actions, 0)::BIGINT,
      COALESCE(metrics_row.delete_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_rate_percent, 0)::NUMERIC,
      computed_delete_rate::NUMERIC,
      bounded_threshold;
    RETURN;
  END IF;

  IF computed_delete_rate >= bounded_threshold THEN
    RETURN QUERY
    SELECT
      'warning'::TEXT,
      format(
        'Warning: message request delete rate %s%% is above threshold %s%%.',
        to_char(computed_delete_rate, 'FM999990.00'),
        to_char(bounded_threshold, 'FM999990.00')
      ),
      COALESCE(metrics_row.total_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_actions, 0)::BIGINT,
      COALESCE(metrics_row.delete_actions, 0)::BIGINT,
      COALESCE(metrics_row.accept_rate_percent, 0)::NUMERIC,
      computed_delete_rate::NUMERIC,
      bounded_threshold;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'healthy'::TEXT,
    format(
      'Healthy: message request delete rate %s%% is below threshold %s%%.',
      to_char(computed_delete_rate, 'FM999990.00'),
      to_char(bounded_threshold, 'FM999990.00')
    ),
    COALESCE(metrics_row.total_actions, 0)::BIGINT,
    COALESCE(metrics_row.accept_actions, 0)::BIGINT,
    COALESCE(metrics_row.delete_actions, 0)::BIGINT,
    COALESCE(metrics_row.accept_rate_percent, 0)::NUMERIC,
    computed_delete_rate::NUMERIC,
    bounded_threshold;
END;
$$;
CREATE OR REPLACE FUNCTION public.run_message_request_critical_mitigation(
  window_days INTEGER DEFAULT 7,
  delete_rate_threshold_percent NUMERIC DEFAULT 70,
  min_actions INTEGER DEFAULT 20,
  throttle_hours INTEGER DEFAULT 24,
  max_senders INTEGER DEFAULT 5
)
RETURNS TABLE (
  sender_id UUID,
  username TEXT,
  display_name TEXT,
  delete_actions BIGINT,
  total_actions BIGINT,
  expires_at TIMESTAMPTZ,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  alert_row RECORD;
  metric_row RECORD;
  sender_row RECORD;
  bounded_window INTEGER;
  bounded_threshold NUMERIC;
  bounded_min_actions INTEGER;
  bounded_hours INTEGER;
  bounded_max_senders INTEGER;
  expiry TIMESTAMPTZ;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  bounded_window := GREATEST(1, LEAST(COALESCE(window_days, 7), 60));
  bounded_threshold := GREATEST(10, LEAST(COALESCE(delete_rate_threshold_percent, 70), 95));
  bounded_min_actions := GREATEST(1, LEAST(COALESCE(min_actions, 20), 500));
  bounded_hours := GREATEST(1, LEAST(COALESCE(throttle_hours, 24), 168));
  bounded_max_senders := GREATEST(1, LEAST(COALESCE(max_senders, 5), 20));

  SELECT * INTO alert_row
  FROM public.get_message_request_alerts(bounded_window, bounded_threshold, bounded_min_actions)
  LIMIT 1;

  IF alert_row IS NULL OR alert_row.warning_level <> 'critical' THEN
    RETURN;
  END IF;

  SELECT * INTO metric_row
  FROM public.get_message_request_admin_metrics(bounded_window)
  LIMIT 1;

  IF metric_row IS NULL THEN
    RETURN;
  END IF;

  expiry := now() + make_interval(hours => bounded_hours);

  FOR sender_row IN
    SELECT
      (sender_item ->> 'sender_id')::UUID AS sender_id,
      COALESCE((sender_item ->> 'username'), '') AS username,
      COALESCE((sender_item ->> 'display_name'), '') AS display_name,
      COALESCE((sender_item ->> 'deletes')::BIGINT, 0) AS deletes,
      COALESCE((sender_item ->> 'actions')::BIGINT, 0) AS actions
    FROM jsonb_array_elements(COALESCE(metric_row.top_sender_breakdown, '[]'::JSONB)) sender_item
    WHERE COALESCE((sender_item ->> 'deletes')::BIGINT, 0) > 0
    ORDER BY COALESCE((sender_item ->> 'deletes')::BIGINT, 0) DESC,
             COALESCE((sender_item ->> 'actions')::BIGINT, 0) DESC
    LIMIT bounded_max_senders
  LOOP
    INSERT INTO public.message_request_sender_throttles (
      sender_id,
      reason,
      delete_actions,
      total_actions,
      threshold_percent,
      expires_at,
      created_by,
      updated_at
    ) VALUES (
      sender_row.sender_id,
      format('critical_delete_rate_%s', to_char(COALESCE(alert_row.delete_rate_percent, 0), 'FM999990.00')),
      sender_row.deletes,
      sender_row.actions,
      bounded_threshold,
      expiry,
      actor_user_id,
      now()
    )
    ON CONFLICT ON CONSTRAINT message_request_sender_throttles_pkey
    DO UPDATE SET
      reason = EXCLUDED.reason,
      delete_actions = EXCLUDED.delete_actions,
      total_actions = EXCLUDED.total_actions,
      threshold_percent = EXCLUDED.threshold_percent,
      expires_at = EXCLUDED.expires_at,
      created_by = EXCLUDED.created_by,
      updated_at = now();

    PERFORM public.log_admin_action(
      'message_request.sender_throttle.applied',
      sender_row.sender_id,
      NULL,
      NULL,
      jsonb_build_object(
        'window_days', bounded_window,
        'threshold_percent', bounded_threshold,
        'delete_rate_percent', COALESCE(alert_row.delete_rate_percent, 0),
        'delete_actions', sender_row.deletes,
        'total_actions', sender_row.actions,
        'expires_at', expiry
      )
    );

    sender_id := sender_row.sender_id;
    username := NULLIF(sender_row.username, '');
    display_name := NULLIF(sender_row.display_name, '');
    delete_actions := sender_row.deletes;
    total_actions := sender_row.actions;
    expires_at := expiry;
    applied := true;
    RETURN NEXT;
  END LOOP;
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
      COALESCE(e.variant, 'control') AS variant_key,
      e.id,
      e.user_id,
      e.suggested_user_id,
      e.created_at
    FROM public.creator_recommendation_exposures e
    WHERE e.created_at >= NOW() - make_interval(days => GREATEST(1, LEAST(COALESCE(window_days, 7), 90)))
  ), clk AS (
    SELECT
      COALESCE(c.variant, 'control') AS variant_key,
      c.id,
      c.user_id,
      c.suggested_user_id,
      c.created_at
    FROM public.creator_recommendation_clicks c
    WHERE c.created_at >= NOW() - make_interval(days => GREATEST(1, LEAST(COALESCE(window_days, 7), 90)))
  ), conv AS (
    SELECT DISTINCT
      e.variant_key,
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
      e.variant_key,
      e.user_id,
      e.suggested_user_id,
      COUNT(*) AS shown_count
    FROM exp e
    GROUP BY e.variant_key, e.user_id, e.suggested_user_id
  ), aggregate_base AS (
    SELECT
      v.variant_key,
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
      SELECT DISTINCT variant_key FROM exp
      UNION
      SELECT DISTINCT variant_key FROM clk
      UNION
      SELECT DISTINCT variant_key FROM conv
    ) v
    LEFT JOIN exp e ON e.variant_key = v.variant_key
    LEFT JOIN clk c ON c.variant_key = v.variant_key
    LEFT JOIN conv ON conv.variant_key = v.variant_key
    LEFT JOIN cap_pairs cp ON cp.variant_key = v.variant_key
    GROUP BY v.variant_key
  )
  SELECT
    ab.variant_key AS variant,
    ab.exposures,
    ab.unique_exposed_users,
    ab.clicks,
    CASE WHEN ab.exposures > 0 THEN (ab.clicks::DOUBLE PRECISION / ab.exposures) * 100 ELSE 0 END AS ctr_percent,
    ab.follow_conversions,
    CASE WHEN ab.exposures > 0 THEN (ab.follow_conversions::DOUBLE PRECISION / ab.exposures) * 100 ELSE 0 END AS follow_conversion_percent,
    CASE WHEN ab.total_pairs > 0 THEN (ab.cap_hit_pairs::DOUBLE PRECISION / ab.total_pairs) * 100 ELSE 0 END AS cap_hit_rate_percent
  FROM aggregate_base ab
  ORDER BY CASE WHEN ab.variant_key = 'control' THEN 0 ELSE 1 END, ab.variant_key;
END;
$$;
