-- Mux adaptive streaming support

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS stream_provider TEXT,
  ADD COLUMN IF NOT EXISTS stream_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS stream_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS stream_playback_id TEXT,
  ADD COLUMN IF NOT EXISTS stream_upload_id TEXT,
  ADD COLUMN IF NOT EXISTS stream_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'videos_stream_status_check'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_stream_status_check
      CHECK (stream_status IN ('uploading', 'processing', 'ready', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_videos_stream_status ON public.videos(stream_status);
CREATE INDEX IF NOT EXISTS idx_videos_stream_provider ON public.videos(stream_provider);
