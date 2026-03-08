
-- Create post_media table for carousel/multi-photo support
CREATE TABLE public.post_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

-- Everyone can view post media (same as videos)
CREATE POLICY "Post media viewable by everyone"
  ON public.post_media FOR SELECT
  USING (true);

-- Users can insert media for their own videos
CREATE POLICY "Users can insert own post media"
  ON public.post_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = post_media.video_id
      AND videos.user_id = auth.uid()
    )
  );

-- Users can delete media for their own videos
CREATE POLICY "Users can delete own post media"
  ON public.post_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = post_media.video_id
      AND videos.user_id = auth.uid()
    )
  );
