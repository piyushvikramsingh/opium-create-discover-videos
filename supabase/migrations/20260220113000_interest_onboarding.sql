-- Interest onboarding support

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_interests_gin ON public.profiles USING GIN (interests);
