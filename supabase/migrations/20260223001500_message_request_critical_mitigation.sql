-- Automatic mitigation for critical message-request delete-rate signals.

CREATE TABLE IF NOT EXISTS public.message_request_sender_throttles (
  sender_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  delete_actions BIGINT NOT NULL DEFAULT 0,
  total_actions BIGINT NOT NULL DEFAULT 0,
  threshold_percent NUMERIC NOT NULL DEFAULT 70,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_request_sender_throttles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view sender throttles" ON public.message_request_sender_throttles;
CREATE POLICY "Admins can view sender throttles"
ON public.message_request_sender_throttles FOR SELECT
USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "Admins can insert sender throttles" ON public.message_request_sender_throttles;
CREATE POLICY "Admins can insert sender throttles"
ON public.message_request_sender_throttles FOR INSERT
WITH CHECK (public.is_current_user_admin());
DROP POLICY IF EXISTS "Admins can update sender throttles" ON public.message_request_sender_throttles;
CREATE POLICY "Admins can update sender throttles"
ON public.message_request_sender_throttles FOR UPDATE
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());
CREATE INDEX IF NOT EXISTS idx_msg_request_sender_throttles_expires_at
  ON public.message_request_sender_throttles(expires_at DESC);
CREATE OR REPLACE FUNCTION public.enforce_message_privacy_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient RECORD;
  recipient_policy TEXT;
  follows_recipient BOOLEAN;
  request_accepted BOOLEAN;
  recipient_has_replied BOOLEAN;
  sender_throttle_active BOOLEAN;
BEGIN
  PERFORM public.assert_mentions_allowed(NEW.content);

  FOR recipient IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id <> NEW.sender_id
  LOOP
    SELECT COALESCE(p.allow_messages_from, 'everyone')
    INTO recipient_policy
    FROM public.profiles p
    WHERE p.user_id = recipient.user_id;

    recipient_policy := COALESCE(recipient_policy, 'everyone');

    IF recipient_policy = 'none' THEN
      RAISE EXCEPTION 'This user is not accepting new messages';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = NEW.sender_id
        AND f.following_id = recipient.user_id
    ) INTO follows_recipient;

    IF recipient_policy = 'following' AND NOT follows_recipient THEN
      RAISE EXCEPTION 'You can message this user only after following';
    END IF;

    SELECT COALESCE(cs.accepted_request, false)
    INTO request_accepted
    FROM public.conversation_settings cs
    WHERE cs.conversation_id = NEW.conversation_id
      AND cs.user_id = recipient.user_id
    LIMIT 1;

    request_accepted := COALESCE(request_accepted, false);

    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = NEW.conversation_id
        AND m.sender_id = recipient.user_id
    ) INTO recipient_has_replied;

    IF NOT follows_recipient AND NOT request_accepted AND NOT recipient_has_replied THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.message_request_sender_throttles t
        WHERE t.sender_id = NEW.sender_id
          AND t.expires_at > now()
      ) INTO sender_throttle_active;

      IF sender_throttle_active THEN
        RAISE EXCEPTION 'Message requests temporarily limited due to safety controls';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_message_privacy_rules ON public.messages;
CREATE TRIGGER trg_enforce_message_privacy_rules
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_privacy_rules();
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
      format('critical_delete_rate_%.2f', COALESCE(alert_row.delete_rate_percent, 0)),
      sender_row.deletes,
      sender_row.actions,
      bounded_threshold,
      expiry,
      actor_user_id,
      now()
    )
    ON CONFLICT (sender_id)
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
