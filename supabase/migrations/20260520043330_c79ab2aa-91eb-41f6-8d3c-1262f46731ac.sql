
ALTER TABLE public.user_interest_affinity
  ADD COLUMN IF NOT EXISTS is_suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suppression_multiplier real NOT NULL DEFAULT 1.0;

-- Update the top-interests function to respect suppression by scaling score by multiplier.
CREATE OR REPLACE FUNCTION public.get_user_top_interests(_user_id uuid, _limit integer DEFAULT 5)
 RETURNS TABLE(interest_category text, score real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT interest_category, (score * COALESCE(suppression_multiplier, 1.0))::real AS score
  FROM public.user_interest_affinity
  WHERE user_id = _user_id
  ORDER BY (score * COALESCE(suppression_multiplier, 1.0)) DESC
  LIMIT _limit;
$function$;
