-- Native mobile feed contract for Flutter/iOS/Android clients
-- Returns CDN-ready adaptive URLs and lightweight metadata.

CREATE OR REPLACE FUNCTION public.get_native_feed_items(limit_count INTEGER DEFAULT 25)
RETURNS TABLE (
  id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  creator TEXT,
  stream_playback_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(limit_count, 25), 1), 100);
BEGIN
  RETURN QUERY
  WITH viewer AS (
    SELECT auth.uid() AS user_id
  ),
  personalized AS (
    SELECT fy.video_id, fy.score
    FROM viewer vw
    JOIN LATERAL public.get_for_you_video_ids(bounded_limit * 4) fy ON vw.user_id IS NOT NULL
  ),
  trending AS (
    SELECT
      v.id AS video_id,
      (
        (COALESCE(v.likes_count, 0) * 1.4) +
        (COALESCE(v.comments_count, 0) * 1.7) +
        (COALESCE(v.shares_count, 0) * 2.6) +
        (20 / SQRT(GREATEST(1::DOUBLE PRECISION, EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600::DOUBLE PRECISION)))
      )::DOUBLE PRECISION AS score
    FROM public.videos v
    WHERE v.stream_status = 'ready'
  ),
  ranked AS (
    SELECT p.video_id, p.score
    FROM personalized p

    UNION ALL

    SELECT t.video_id, t.score
    FROM trending t
    WHERE NOT EXISTS (
      SELECT 1 FROM personalized p WHERE p.video_id = t.video_id
    )
  ),
  dedup AS (
    SELECT DISTINCT ON (r.video_id)
      r.video_id,
      r.score
    FROM ranked r
    ORDER BY r.video_id, r.score DESC
  )
  SELECT
    v.id,
    COALESCE(
      NULLIF(v.video_url, ''),
      CASE
        WHEN NULLIF(v.stream_playback_id, '') IS NOT NULL
        THEN 'https://stream.mux.com/' || v.stream_playback_id || '.m3u8'
        ELSE ''
      END
    ) AS video_url,
    COALESCE(
      NULLIF(v.thumbnail_url, ''),
      CASE
        WHEN NULLIF(v.stream_playback_id, '') IS NOT NULL
        THEN 'https://image.mux.com/' || v.stream_playback_id || '/thumbnail.jpg?fit_mode=preserve&time=1'
        ELSE ''
      END
    ) AS thumbnail_url,
    COALESCE(v.description, '') AS description,
    COALESCE('@' || NULLIF(p.username, ''), '@opium') AS creator,
    COALESCE(v.stream_playback_id, '') AS stream_playback_id,
    v.created_at
  FROM dedup d
  JOIN public.videos v ON v.id = d.video_id
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  WHERE v.stream_status = 'ready'
    AND COALESCE(
      NULLIF(v.video_url, ''),
      CASE
        WHEN NULLIF(v.stream_playback_id, '') IS NOT NULL
        THEN 'https://stream.mux.com/' || v.stream_playback_id || '.m3u8'
        ELSE ''
      END
    ) <> ''
  ORDER BY d.score DESC, v.created_at DESC
  LIMIT bounded_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_native_feed_items(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_native_feed_items(INTEGER) TO authenticated;
