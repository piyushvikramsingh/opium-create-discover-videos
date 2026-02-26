-- For You relevance RPC: server-side ranking with personalization and safety filtering

CREATE INDEX IF NOT EXISTS idx_video_events_user_created_type_video
ON public.video_events(user_id, created_at DESC, event_type, video_id);
CREATE OR REPLACE FUNCTION public.get_for_you_video_ids(limit_count INTEGER DEFAULT 150)
RETURNS TABLE(video_id UUID, score DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH viewer AS (
  SELECT auth.uid() AS user_id
),
hidden AS (
  SELECT hv.video_id
  FROM public.hidden_videos hv
  JOIN viewer vw ON vw.user_id IS NOT NULL AND hv.user_id = vw.user_id
),
blocked AS (
  SELECT ub.blocked_user_id
  FROM public.user_blocks ub
  JOIN viewer vw ON vw.user_id IS NOT NULL AND ub.user_id = vw.user_id
),
muted AS (
  SELECT um.muted_user_id
  FROM public.user_mutes um
  JOIN viewer vw ON vw.user_id IS NOT NULL AND um.user_id = vw.user_id
),
event_scores AS (
  SELECT
    ranked.video_id,
    SUM(ranked.base_weight * ranked.rank_decay) AS affinity
  FROM (
    SELECT
      ve.video_id,
      CASE ve.event_type
        WHEN 'view_start' THEN 0.4
        WHEN 'view_3s' THEN 1.5
        WHEN 'view_complete' THEN 7
        WHEN 'like' THEN 8
        WHEN 'share' THEN 14
        WHEN 'follow' THEN 18
        WHEN 'hide' THEN -20
        WHEN 'report' THEN -28
        ELSE 0
      END::DOUBLE PRECISION AS base_weight,
      GREATEST(0.2, 1 - ((ROW_NUMBER() OVER (ORDER BY ve.created_at DESC) - 1) * 0.0025))::DOUBLE PRECISION AS rank_decay
    FROM public.video_events ve
    JOIN viewer vw ON vw.user_id IS NOT NULL AND ve.user_id = vw.user_id
    ORDER BY ve.created_at DESC
    LIMIT 400
  ) ranked
  GROUP BY ranked.video_id
),
followed AS (
  SELECT f.following_id
  FROM public.follows f
  JOIN viewer vw ON vw.user_id IS NOT NULL AND f.follower_id = vw.user_id
),
interests AS (
  SELECT LOWER(UNNEST(COALESCE(p.interests, ARRAY[]::TEXT[]))) AS interest
  FROM public.profiles p
  JOIN viewer vw ON vw.user_id IS NOT NULL AND p.user_id = vw.user_id
),
base_videos AS (
  SELECT v.*
  FROM public.videos v
  WHERE NOT EXISTS (SELECT 1 FROM hidden h WHERE h.video_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM blocked b WHERE b.blocked_user_id = v.user_id)
    AND NOT EXISTS (SELECT 1 FROM muted m WHERE m.muted_user_id = v.user_id)
),
scored AS (
  SELECT
    v.id AS video_id,
    (
      (COALESCE(v.likes_count, 0) * 1.3) +
      (COALESCE(v.comments_count, 0) * 1.8) +
      (COALESCE(v.shares_count, 0) * 2.5) +
      (18 / SQRT(GREATEST(1::DOUBLE PRECISION, EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600::DOUBLE PRECISION))) +
      (COALESCE(es.affinity, 0) * 2.1) +
      (CASE WHEN EXISTS (SELECT 1 FROM followed f WHERE f.following_id = v.user_id) THEN 12 ELSE 0 END) +
      (
        COALESCE((
          SELECT COUNT(*)
          FROM interests i
          WHERE LOWER(COALESCE(v.description, '') || ' ' || COALESCE(v.music, '')) LIKE '%' || i.interest || '%'
        ), 0) * 14
      )
    )::DOUBLE PRECISION AS score
  FROM base_videos v
  LEFT JOIN event_scores es ON es.video_id = v.id
)
SELECT s.video_id, s.score
FROM scored s
ORDER BY s.score DESC
LIMIT GREATEST(COALESCE(limit_count, 150), 1);
$$;
