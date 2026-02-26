-- Admin audit logs for verification, monetization and moderation actions

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  target_report_id UUID REFERENCES public.video_reports(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()), false);
$$;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view all audit logs"
ON public.admin_audit_logs
FOR SELECT
USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "Admins can insert own audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert own audit logs"
ON public.admin_audit_logs
FOR INSERT
WITH CHECK (public.is_current_user_admin() AND auth.uid() = actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON public.admin_audit_logs(action);
CREATE OR REPLACE FUNCTION public.log_admin_action(
  action_name TEXT,
  target_user UUID DEFAULT NULL,
  target_video UUID DEFAULT NULL,
  target_report UUID DEFAULT NULL,
  payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    action,
    target_user_id,
    target_video_id,
    target_report_id,
    metadata
  ) VALUES (
    auth.uid(),
    action_name,
    target_user,
    target_video,
    target_report,
    COALESCE(payload, '{}'::jsonb)
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.trg_log_profile_admin_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    PERFORM public.log_admin_action(
      'profile.verification.changed',
      NEW.user_id,
      NULL,
      NULL,
      jsonb_build_object('from', OLD.is_verified, 'to', NEW.is_verified)
    );
  END IF;

  IF NEW.is_monetized IS DISTINCT FROM OLD.is_monetized THEN
    PERFORM public.log_admin_action(
      'profile.monetization.changed',
      NEW.user_id,
      NULL,
      NULL,
      jsonb_build_object('from', OLD.is_monetized, 'to', NEW.is_monetized)
    );
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    PERFORM public.log_admin_action(
      'profile.admin_role.changed',
      NEW.user_id,
      NULL,
      NULL,
      jsonb_build_object('from', OLD.is_admin, 'to', NEW.is_admin)
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_profile_admin_changes ON public.profiles;
CREATE TRIGGER trg_log_profile_admin_changes
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_profile_admin_changes();
CREATE OR REPLACE FUNCTION public.trg_log_report_status_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_admin_action(
      'report.status.changed',
      NULL,
      NEW.video_id,
      NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'reason', NEW.reason)
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_report_status_changes ON public.video_reports;
CREATE TRIGGER trg_log_report_status_changes
AFTER UPDATE ON public.video_reports
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_report_status_changes();
CREATE OR REPLACE FUNCTION public.trg_log_admin_video_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RETURN OLD;
  END IF;

  PERFORM public.log_admin_action(
    'video.deleted',
    OLD.user_id,
    OLD.id,
    NULL,
    jsonb_build_object('description', COALESCE(OLD.description, ''), 'created_at', OLD.created_at)
  );

  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_admin_video_delete ON public.videos;
CREATE TRIGGER trg_log_admin_video_delete
AFTER DELETE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_admin_video_delete();
