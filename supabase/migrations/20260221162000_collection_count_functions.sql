-- Add functions to manage collection video counts
CREATE OR REPLACE FUNCTION public.increment_collection_video_count(collection_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.collections
  SET video_count = video_count + 1, updated_at = now()
  WHERE id = collection_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.decrement_collection_video_count(collection_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.collections
  SET video_count = GREATEST(video_count - 1, 0), updated_at = now()
  WHERE id = collection_id;
END;
$$;
