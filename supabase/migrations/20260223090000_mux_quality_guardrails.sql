-- Ingest quality guardrails metadata for Mux-backed streams

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS stream_quality_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS stream_quality JSONB,
  ADD COLUMN IF NOT EXISTS stream_quality_checked_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'videos_stream_quality_status_check'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_stream_quality_status_check
      CHECK (stream_quality_status IN ('unknown', 'pass', 'warn', 'fail'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_videos_stream_quality_status
  ON public.videos(stream_quality_status);
