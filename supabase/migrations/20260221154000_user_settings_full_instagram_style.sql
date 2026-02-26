-- Extended user settings store for Instagram-style settings categories

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  privacy JSONB NOT NULL DEFAULT '{}'::jsonb,
  notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  interactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ads JSONB NOT NULL DEFAULT '{}'::jsonb,
  accessibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  app JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own user settings" ON public.user_settings;
CREATE POLICY "Users can view own user settings"
ON public.user_settings FOR SELECT
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own user settings" ON public.user_settings;
CREATE POLICY "Users can insert own user settings"
ON public.user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own user settings" ON public.user_settings;
CREATE POLICY "Users can update own user settings"
ON public.user_settings FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
