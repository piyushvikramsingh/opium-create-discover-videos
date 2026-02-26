-- Video upload metadata expansion for advanced Create workflow

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'followers')),
  ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'close_friends', 'age_18_plus')),
  ADD COLUMN IF NOT EXISTS content_warning BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cross_post_story BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_post_reel BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cross_post_profile BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS collaborators TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tagged_people TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS upload_group_id UUID,
  ADD COLUMN IF NOT EXISTS upload_group_index INTEGER,
  ADD COLUMN IF NOT EXISTS merge_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clip_settings JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_text TEXT,
  ADD COLUMN IF NOT EXISTS music_start_seconds NUMERIC NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_for ON public.videos(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_videos_upload_group ON public.videos(upload_group_id, upload_group_index);
CREATE INDEX IF NOT EXISTS idx_videos_audience_visibility ON public.videos(audience, visibility);
