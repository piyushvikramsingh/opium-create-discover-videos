-- Message request accept/delete funnel analytics and admin abuse visibility.

CREATE TABLE IF NOT EXISTS public.message_request_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('accept', 'delete')),
  surface TEXT NOT NULL DEFAULT 'inbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_request_action_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own message request action events" ON public.message_request_action_events;
CREATE POLICY "Users can view own message request action events"
ON public.message_request_action_events FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own message request action events" ON public.message_request_action_events;
CREATE POLICY "Users can insert own message request action events"
ON public.message_request_action_events FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can view all message request action events" ON public.message_request_action_events;
CREATE POLICY "Admins can view all message request action events"
ON public.message_request_action_events FOR SELECT
USING (public.is_current_user_admin());
CREATE INDEX IF NOT EXISTS idx_msg_request_events_user_created
  ON public.message_request_action_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_request_events_conversation_created
  ON public.message_request_action_events(conversation_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.log_message_request_action(
  conversation_id_input UUID,
  action_input TEXT,
  surface_name TEXT DEFAULT 'inbox'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID;
BEGIN
  actor := auth.uid();
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF action_input NOT IN ('accept', 'delete') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.message_request_action_events (user_id, conversation_id, action, surface)
  VALUES (actor, conversation_id_input, action_input, COALESCE(NULLIF(surface_name, ''), 'inbox'));
END;
$$;
CREATE OR REPLACE FUNCTION public.get_message_request_admin_metrics(p_window_days INTEGER DEFAULT 7)
RETURNS TABLE (
  window_days INTEGER,
  total_actions BIGINT,
  accept_actions BIGINT,
  delete_actions BIGINT,
  accept_rate_percent NUMERIC,
  unique_receivers BIGINT,
  unique_senders BIGINT,
  top_sender_breakdown JSONB
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
  WITH cutoff AS (
    SELECT now() - make_interval(days => GREATEST(1, LEAST(p_window_days, 60))) AS since
  ),
  scoped AS (
    SELECT e.*
    FROM public.message_request_action_events e
    CROSS JOIN cutoff c
    WHERE e.created_at >= c.since
  ),
  sender_stats AS (
    SELECT
      first_sender.sender_id,
      COUNT(*)::BIGINT AS actions,
      COUNT(*) FILTER (WHERE s.action = 'delete')::BIGINT AS deletes
    FROM scoped s
    JOIN LATERAL (
      SELECT m.sender_id
      FROM public.messages m
      WHERE m.conversation_id = s.conversation_id
      ORDER BY m.created_at ASC
      LIMIT 1
    ) first_sender ON TRUE
    GROUP BY first_sender.sender_id
    ORDER BY deletes DESC, actions DESC
    LIMIT 5
  )
  SELECT
    GREATEST(1, LEAST(p_window_days, 60))::INTEGER AS window_days,
    COUNT(*)::BIGINT AS total_actions,
    COUNT(*) FILTER (WHERE s.action = 'accept')::BIGINT AS accept_actions,
    COUNT(*) FILTER (WHERE s.action = 'delete')::BIGINT AS delete_actions,
    CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE s.action = 'accept')::NUMERIC * 100.0) / COUNT(*), 2)
    END AS accept_rate_percent,
    COUNT(DISTINCT s.user_id)::BIGINT AS unique_receivers,
    COUNT(DISTINCT first_sender.sender_id)::BIGINT AS unique_senders,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'sender_id', ss.sender_id,
            'actions', ss.actions,
            'deletes', ss.deletes,
            'username', p.username,
            'display_name', p.display_name
          )
        )
        FROM sender_stats ss
        LEFT JOIN public.profiles p ON p.user_id = ss.sender_id
      ),
      '[]'::JSONB
    ) AS top_sender_breakdown
  FROM scoped s
  LEFT JOIN LATERAL (
    SELECT m.sender_id
    FROM public.messages m
    WHERE m.conversation_id = s.conversation_id
    ORDER BY m.created_at ASC
    LIMIT 1
  ) first_sender ON TRUE;
END;
$$;
