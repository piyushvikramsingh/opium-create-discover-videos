-- Admin-controlled verification and monetization controls

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_monetized BOOLEAN NOT NULL DEFAULT false;
UPDATE public.profiles
SET
  is_admin = COALESCE(is_admin, false),
  is_monetized = COALESCE(is_monetized, false);
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()), false);
$$;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());
CREATE OR REPLACE FUNCTION public.prevent_non_admin_profile_status_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Only admin can change verification status';
    END IF;

    IF NEW.is_monetized IS DISTINCT FROM OLD.is_monetized THEN
      RAISE EXCEPTION 'Only admin can change monetization status';
    END IF;

    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Only admin can change admin status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_non_admin_profile_status_changes ON public.profiles;
CREATE TRIGGER trg_prevent_non_admin_profile_status_changes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_admin_profile_status_changes();
