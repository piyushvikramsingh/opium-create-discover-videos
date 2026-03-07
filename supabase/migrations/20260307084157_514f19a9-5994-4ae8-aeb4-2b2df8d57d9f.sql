
-- Add FK from stories to profiles for join queries
ALTER TABLE public.stories 
  ADD CONSTRAINT stories_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add FK from story_views to profiles
ALTER TABLE public.story_views
  ADD CONSTRAINT story_views_viewer_id_fkey
  FOREIGN KEY (viewer_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add missing interests column on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests jsonb DEFAULT '[]'::jsonb;

-- Create video_events table for analytics/tracking
CREATE TABLE IF NOT EXISTS public.video_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  watch_ms integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own video events" ON public.video_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own video events" ON public.video_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create video_reports table
CREATE TABLE IF NOT EXISTS public.video_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'inappropriate',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, video_id)
);
ALTER TABLE public.video_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reports" ON public.video_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create reports" ON public.video_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
