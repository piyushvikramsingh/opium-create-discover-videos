-- Reliable social action pipeline + stronger ranking + comment safety filters.

-- 1) Idempotency key for comments to support safe client retries.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_user_request_id
  ON public.comments(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 2) Idempotent set-like operation (safe for retries/replays).
CREATE OR REPLACE FUNCTION public.set_video_like(
  p_video_id UUID,
  p_should_like BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(liked BOOLEAN, likes_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_should_like THEN
    INSERT INTO public.likes (user_id, video_id)
    VALUES (v_user_id, p_video_id)
    ON CONFLICT (user_id, video_id) DO NOTHING;
  ELSE
    DELETE FROM public.likes
    WHERE user_id = v_user_id
      AND video_id = p_video_id;
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.likes l
      WHERE l.user_id = v_user_id
        AND l.video_id = p_video_id
    ) AS liked,
    COALESCE(v.likes_count, 0)::INTEGER AS likes_count
  FROM public.videos v
  WHERE v.id = p_video_id;
END;
$$;

-- 3) Idempotent set-bookmark operation (safe for retries/replays).
CREATE OR REPLACE FUNCTION public.set_video_bookmark(
  p_video_id UUID,
  p_should_bookmark BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(bookmarked BOOLEAN, bookmarks_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_should_bookmark THEN
    INSERT INTO public.bookmarks (user_id, video_id)
    VALUES (v_user_id, p_video_id)
    ON CONFLICT (user_id, video_id) DO NOTHING;
  ELSE
    DELETE FROM public.bookmarks
    WHERE user_id = v_user_id
      AND video_id = p_video_id;
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.bookmarks b
      WHERE b.user_id = v_user_id
        AND b.video_id = p_video_id
    ) AS bookmarked,
    COALESCE(v.bookmarks_count, 0)::INTEGER AS bookmarks_count
  FROM public.videos v
  WHERE v.id = p_video_id;
END;
$$;

-- 4) Idempotent comment creation for retry-safe writes.
CREATE OR REPLACE FUNCTION public.create_comment_idempotent(
  p_video_id UUID,
  p_content TEXT,
  p_client_request_id TEXT DEFAULT NULL
)
RETURNS public.comments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_trimmed TEXT := BTRIM(COALESCE(p_content, ''));
  v_existing public.comments;
  v_created public.comments;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;

  IF LENGTH(v_trimmed) > 280 THEN
    RAISE EXCEPTION 'Comment must be 280 characters or less';
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT c.*
    INTO v_existing
    FROM public.comments c
    WHERE c.user_id = v_user_id
      AND c.client_request_id = p_client_request_id
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.comments (user_id, video_id, content, client_request_id)
    VALUES (v_user_id, p_video_id, v_trimmed, p_client_request_id)
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT c.*
      INTO v_created
      FROM public.comments c
      WHERE c.user_id = v_user_id
        AND c.client_request_id = p_client_request_id
      LIMIT 1;

      IF v_created.id IS NULL THEN
        RAISE;
      END IF;
  END;

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_video_like(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_video_bookmark(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_comment_idempotent(UUID, TEXT, TEXT) TO authenticated;

-- 5) Blocked-word moderation list in settings + DB enforcement.
UPDATE public.user_settings
SET interactions = COALESCE(interactions, '{}'::jsonb) ||
  jsonb_build_object(
    'comment_blocked_words',
    COALESCE(interactions -> 'comment_blocked_words', '[]'::jsonb)
  )
WHERE NOT (COALESCE(interactions, '{}'::jsonb) ? 'comment_blocked_words');

CREATE OR REPLACE FUNCTION public.enforce_comment_blocked_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_terms TEXT[];
  v_content TEXT := LOWER(COALESCE(NEW.content, ''));
  v_term TEXT;
BEGIN
  IF v_content = '' THEN
    RETURN NEW;
  END IF;

  SELECT v.user_id
  INTO v_owner_id
  FROM public.videos v
  WHERE v.id = NEW.video_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY_AGG(LOWER(TRIM(term_value)))
  INTO v_terms
  FROM jsonb_array_elements_text(
    COALESCE(
      (
        SELECT us.interactions -> 'comment_blocked_words'
        FROM public.user_settings us
        WHERE us.user_id = v_owner_id
      ),
      '[]'::jsonb
    )
  ) AS term_value
  WHERE TRIM(term_value) <> '';

  IF v_terms IS NULL OR CARDINALITY(v_terms) = 0 THEN
    RETURN NEW;
  END IF;

  FOREACH v_term IN ARRAY v_terms LOOP
    IF LENGTH(v_term) >= 2 AND POSITION(v_term IN v_content) > 0 THEN
      RAISE EXCEPTION 'Comment contains blocked term'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comment_blocked_terms ON public.comments;
CREATE TRIGGER trg_enforce_comment_blocked_terms
BEFORE INSERT OR UPDATE OF content ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_blocked_terms();

-- 6) Feed ranking v1: include watch-time depth, rewatch/completion behavior, creator affinity, and freshness guardrails.
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
recent_events AS (
  SELECT
    ve.video_id,
    ve.event_type,
    COALESCE(ve.watch_ms, 0)::DOUBLE PRECISION AS watch_ms,
    ROW_NUMBER() OVER (ORDER BY ve.created_at DESC) AS recency_rank
  FROM public.video_events ve
  JOIN viewer vw ON vw.user_id IS NOT NULL AND ve.user_id = vw.user_id
  ORDER BY ve.created_at DESC
  LIMIT 600
),
event_scores AS (
  SELECT
    re.video_id,
    SUM(
      (
        CASE re.event_type
          WHEN 'view_start' THEN 0.5
          WHEN 'view_3s' THEN 2.0
          WHEN 'view_complete' THEN 8.8
          WHEN 'like' THEN 9.5
          WHEN 'share' THEN 16.0
          WHEN 'follow' THEN 18.0
          WHEN 'hide' THEN -22.0
          WHEN 'report' THEN -30.0
          ELSE 0
        END +
        CASE
          WHEN re.event_type IN ('view_3s', 'view_complete')
            THEN LEAST(re.watch_ms / 1000.0, 30.0) * 0.085
          ELSE 0
        END
      ) * GREATEST(0.18, 1 - ((re.recency_rank - 1) * 0.0022))
    )::DOUBLE PRECISION AS affinity,
    SUM(CASE WHEN re.event_type = 'view_complete' THEN 1 ELSE 0 END)::DOUBLE PRECISION AS completes,
    SUM(CASE WHEN re.event_type = 'view_start' THEN 1 ELSE 0 END)::DOUBLE PRECISION AS starts
  FROM recent_events re
  GROUP BY re.video_id
),
creator_affinity AS (
  SELECT
    v.user_id AS creator_id,
    SUM(es.affinity)::DOUBLE PRECISION AS score
  FROM event_scores es
  JOIN public.videos v ON v.id = es.video_id
  GROUP BY v.user_id
),
base_videos AS (
  SELECT v.*
  FROM public.videos v
  WHERE (v.scheduled_for IS NULL OR v.scheduled_for <= NOW())
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.video_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM blocked b WHERE b.blocked_user_id = v.user_id)
    AND NOT EXISTS (SELECT 1 FROM muted m WHERE m.muted_user_id = v.user_id)
),
scored AS (
  SELECT
    v.id AS video_id,
    (
      (COALESCE(v.likes_count, 0) * 1.15) +
      (COALESCE(v.comments_count, 0) * 1.7) +
      (COALESCE(v.shares_count, 0) * 2.45) +
      (COALESCE(v.bookmarks_count, 0) * 2.05) +
      (18.0 / SQRT(GREATEST(1.0, EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600.0))) +
      (COALESCE(es.affinity, 0) * 2.35) +
      (COALESCE(ca.score, 0) * 0.75) +
      (
        CASE
          WHEN COALESCE(es.starts, 0) > 0
            THEN LEAST(10.0, (COALESCE(es.completes, 0) / es.starts) * 11.0)
          ELSE 0
        END
      ) +
      (CASE WHEN EXISTS (SELECT 1 FROM followed f WHERE f.following_id = v.user_id) THEN 10 ELSE 0 END) +
      (
        COALESCE(
          (
            SELECT COUNT(*)
            FROM interests i
            WHERE LOWER(COALESCE(v.description, '') || ' ' || COALESCE(v.music, '')) LIKE '%' || i.interest || '%'
          ),
          0
        ) * 10.5
      ) +
      (
        CASE
          WHEN NOW() - v.created_at > INTERVAL '14 days' THEN -4
          ELSE 0
        END
      )
    )::DOUBLE PRECISION AS score
  FROM base_videos v
  LEFT JOIN event_scores es ON es.video_id = v.id
  LEFT JOIN creator_affinity ca ON ca.creator_id = v.user_id
)
SELECT s.video_id, s.score
FROM scored s
ORDER BY s.score DESC
LIMIT GREATEST(COALESCE(limit_count, 150), 1);
$$;
