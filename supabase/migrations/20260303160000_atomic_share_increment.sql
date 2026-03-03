-- Atomic share counter increment so non-owners can safely register shares via RPC.

CREATE OR REPLACE FUNCTION public.increment_video_share(
  p_video_id UUID
)
RETURNS TABLE(shares_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.videos
  SET shares_count = COALESCE(shares_count, 0) + 1
  WHERE id = p_video_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video not found';
  END IF;

  RETURN QUERY
  SELECT v.shares_count::INTEGER
  FROM public.videos v
  WHERE v.id = p_video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_video_share(UUID) TO authenticated;
