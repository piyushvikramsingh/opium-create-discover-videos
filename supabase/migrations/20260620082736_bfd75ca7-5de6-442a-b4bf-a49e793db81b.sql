
CREATE TABLE IF NOT EXISTS public.live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  viewer_count INTEGER NOT NULL DEFAULT 0,
  peak_viewers INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_streams TO authenticated;
GRANT ALL ON public.live_streams TO service_role;
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live streams readable by authenticated"
  ON public.live_streams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can start their own stream"
  ON public.live_streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own stream"
  ON public.live_streams FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own stream"
  ON public.live_streams FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_live_streams_status_started
  ON public.live_streams (status, started_at DESC);

CREATE TRIGGER live_streams_updated_at
  BEFORE UPDATE ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.live_stream_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (stream_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_stream_viewers TO authenticated;
GRANT ALL ON public.live_stream_viewers TO service_role;
ALTER TABLE public.live_stream_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewer rows readable by authenticated"
  ON public.live_stream_viewers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can record their own viewership"
  ON public.live_stream_viewers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own viewership"
  ON public.live_stream_viewers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own viewership"
  ON public.live_stream_viewers FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.live_streams REPLICA IDENTITY FULL;
ALTER TABLE public.live_stream_viewers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_streams'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_stream_viewers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_viewers';
  END IF;
END $$;
