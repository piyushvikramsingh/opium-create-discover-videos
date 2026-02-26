-- Manage active message request throttles: list, release, and cleanup.

CREATE OR REPLACE FUNCTION public.get_active_message_request_sender_throttles(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  sender_id UUID,
  username TEXT,
  display_name TEXT,
  reason TEXT,
  delete_actions BIGINT,
  total_actions BIGINT,
  threshold_percent NUMERIC,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    t.sender_id,
    p.username,
    p.display_name,
    t.reason,
    t.delete_actions,
    t.total_actions,
    t.threshold_percent,
    t.expires_at,
    t.created_at,
    t.updated_at
  FROM public.message_request_sender_throttles t
  LEFT JOIN public.profiles p ON p.user_id = t.sender_id
  WHERE t.expires_at > now()
  ORDER BY t.expires_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 100), 500));
END;
$$;
CREATE OR REPLACE FUNCTION public.release_message_request_sender_throttle(
  sender_id_input UUID,
  release_reason TEXT DEFAULT 'manual_admin_release'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  deleted_count INTEGER;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  DELETE FROM public.message_request_sender_throttles
  WHERE sender_id = sender_id_input;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    PERFORM public.log_admin_action(
      'message_request.sender_throttle.released',
      sender_id_input,
      NULL,
      NULL,
      jsonb_build_object('reason', COALESCE(NULLIF(release_reason, ''), 'manual_admin_release'))
    );
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
CREATE OR REPLACE FUNCTION public.cleanup_expired_message_request_sender_throttles()
RETURNS TABLE (
  released_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  removed_count INTEGER;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  DELETE FROM public.message_request_sender_throttles
  WHERE expires_at <= now();

  GET DIAGNOSTICS removed_count = ROW_COUNT;

  PERFORM public.log_admin_action(
    'message_request.sender_throttle.cleanup',
    NULL,
    NULL,
    NULL,
    jsonb_build_object('released_count', removed_count)
  );

  RETURN QUERY SELECT removed_count;
END;
$$;
