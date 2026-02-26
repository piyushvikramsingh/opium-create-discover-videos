-- Instagram-style privacy, messaging and security preferences on profile

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_mentions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_messages_from TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS push_likes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_messages BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_alerts BOOLEAN NOT NULL DEFAULT true;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_allow_messages_from_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_allow_messages_from_check
      CHECK (allow_messages_from IN ('everyone', 'following', 'none'));
  END IF;
END;
$$;
