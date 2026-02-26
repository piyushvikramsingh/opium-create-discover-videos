-- Native mobile performance telemetry events

CREATE TABLE IF NOT EXISTS public.mobile_perf_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  video_id UUID,
  startup_ms INTEGER,
  rebuffer_ms INTEGER,
  slow_frame_pct DOUBLE PRECISION,
  slow_frames INTEGER,
  total_frames INTEGER,
  platform TEXT,
  network_tier TEXT,
  app_version TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mobile_perf_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role writes mobile perf events" ON public.mobile_perf_events;
CREATE POLICY "Service role writes mobile perf events"
ON public.mobile_perf_events
FOR INSERT
TO service_role
WITH CHECK (true);
DROP POLICY IF EXISTS "Admins view mobile perf events" ON public.mobile_perf_events;
CREATE POLICY "Admins view mobile perf events"
ON public.mobile_perf_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND COALESCE(p.is_admin, false) = true
  )
);
CREATE INDEX IF NOT EXISTS idx_mobile_perf_events_created_at
  ON public.mobile_perf_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_perf_events_event_type
  ON public.mobile_perf_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mobile_perf_events_session
  ON public.mobile_perf_events(device_session_id);
CREATE INDEX IF NOT EXISTS idx_mobile_perf_events_video_id
  ON public.mobile_perf_events(video_id);
