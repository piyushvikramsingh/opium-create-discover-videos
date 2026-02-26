-- Abuse moderation automation + retention nudges

-- Extend notification types to support retention nudges.
DO $$
DECLARE
  existing_constraint_name text;
BEGIN
  SELECT c.conname
  INTO existing_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'notifications'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type IN%'
  LIMIT 1;

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', existing_constraint_name);
  END IF;
END;
$$;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'follow',
    'message',
    'comment',
    'reply',
    'like',
    'save',
    'recap',
    'reengage'
  ));
-- Auto-escalate risky/open reports into reviewing queue.
CREATE OR REPLACE FUNCTION public.run_abuse_moderation_automation(max_updates INTEGER DEFAULT 100)
RETURNS TABLE (
  report_id UUID,
  new_status TEXT,
  priority_reason TEXT
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
  WITH base AS (
    SELECT
      vr.id,
      vr.reason,
      vr.video_id,
      v.user_id AS owner_user_id,
      (
        SELECT COUNT(*)::INT
        FROM public.video_reports vr2
        WHERE vr2.video_id = vr.video_id
          AND vr2.status IN ('open', 'reviewing')
      ) AS report_count_on_video,
      (
        SELECT COUNT(*)::INT
        FROM public.video_reports vr3
        JOIN public.videos v3 ON v3.id = vr3.video_id
        WHERE v3.user_id = v.user_id
          AND vr3.status IN ('open', 'reviewing')
      ) AS owner_open_reports
    FROM public.video_reports vr
    JOIN public.videos v ON v.id = vr.video_id
    WHERE vr.status = 'open'
  ), candidates AS (
    SELECT
      b.id,
      CASE
        WHEN LOWER(COALESCE(b.reason, '')) IN ('self-harm', 'hate', 'violence') THEN 'severe_reason'
        WHEN b.report_count_on_video >= 3 THEN 'repeat_reports_on_video'
        WHEN b.owner_open_reports >= 5 THEN 'repeat_offender_pattern'
        ELSE NULL
      END AS escalation_reason
    FROM base b
  ), target AS (
    SELECT c.id, c.escalation_reason
    FROM candidates c
    WHERE c.escalation_reason IS NOT NULL
    LIMIT GREATEST(1, LEAST(COALESCE(max_updates, 100), 500))
  ), updated AS (
    UPDATE public.video_reports vr
    SET status = 'reviewing'
    FROM target t
    WHERE vr.id = t.id
    RETURNING vr.id AS report_id, 'reviewing'::TEXT AS new_status, t.escalation_reason AS priority_reason
  )
  SELECT * FROM updated;
END;
$$;
-- Create recap + reengagement notifications from activity windows.
CREATE OR REPLACE FUNCTION public.run_retention_nudges(limit_count INTEGER DEFAULT 200)
RETURNS TABLE (
  kind TEXT,
  inserted_count INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  viewer_id UUID := auth.uid();
  viewer_is_admin BOOLEAN := false;
  recap_count INTEGER := 0;
  reengage_count INTEGER := 0;
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

  WITH active_24h AS (
    SELECT
      ve.user_id,
      COUNT(*)::INT AS event_count
    FROM public.video_events ve
    WHERE ve.created_at >= NOW() - interval '24 hours'
    GROUP BY ve.user_id
  ), recap_targets AS (
    SELECT a.user_id
    FROM active_24h a
    LEFT JOIN public.user_settings us ON us.user_id = a.user_id
    WHERE a.event_count >= 3
      AND COALESCE((us.notifications ->> 'daily_recap')::BOOLEAN, true)
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = a.user_id
          AND n.type = 'recap'
          AND n.created_at >= NOW() - interval '20 hours'
      )
    LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 200), 1000))
  )
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
  SELECT
    rt.user_id,
    NULL,
    'recap',
    'Your daily recap is ready',
    'See what worked today and keep your streak going.',
    NULL
  FROM recap_targets rt;

  GET DIAGNOSTICS recap_count = ROW_COUNT;

  WITH historically_active AS (
    SELECT DISTINCT ve.user_id
    FROM public.video_events ve
    WHERE ve.created_at < NOW() - interval '72 hours'
  ), inactive_recent AS (
    SELECT ha.user_id
    FROM historically_active ha
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.video_events ve_recent
      WHERE ve_recent.user_id = ha.user_id
        AND ve_recent.created_at >= NOW() - interval '72 hours'
    )
  ), reengage_targets AS (
    SELECT ir.user_id
    FROM inactive_recent ir
    LEFT JOIN public.user_settings us ON us.user_id = ir.user_id
    WHERE COALESCE((us.notifications ->> 'reengagement_nudges')::BOOLEAN, true)
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = ir.user_id
          AND n.type = 'reengage'
          AND n.created_at >= NOW() - interval '72 hours'
      )
    LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 200), 1000))
  )
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
  SELECT
    rt.user_id,
    NULL,
    'reengage',
    'New creators are waiting for you',
    'Open Opium and catch fresh picks tailored for you.',
    NULL
  FROM reengage_targets rt;

  GET DIAGNOSTICS reengage_count = ROW_COUNT;

  RETURN QUERY
  SELECT 'recap'::TEXT AS kind, recap_count
  UNION ALL
  SELECT 'reengage'::TEXT AS kind, reengage_count;
END;
$$;
