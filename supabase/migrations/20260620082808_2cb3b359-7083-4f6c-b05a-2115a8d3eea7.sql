
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stream_key TEXT UNIQUE;

ALTER TABLE public.live_streams DROP CONSTRAINT IF EXISTS live_streams_status_check;
ALTER TABLE public.live_streams
  ADD CONSTRAINT live_streams_status_check
  CHECK (status IN ('live','ended','scheduled'));

ALTER TABLE public.live_streams ALTER COLUMN started_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.live_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_comments TO authenticated;
GRANT ALL ON public.live_comments TO service_role;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live comments readable by authenticated"
  ON public.live_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can post live comments"
  ON public.live_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit their own live comments"
  ON public.live_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own live comments"
  ON public.live_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_live_comments_stream_created
  ON public.live_comments (stream_id, created_at);

ALTER TABLE public.live_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments';
  END IF;
END $$;
