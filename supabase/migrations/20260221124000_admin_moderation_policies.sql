-- Admin moderation policies for reports and videos

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()), false);
$$;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.video_reports;
CREATE POLICY "Admins can view all reports"
ON public.video_reports
FOR SELECT
USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "Admins can update reports" ON public.video_reports;
CREATE POLICY "Admins can update reports"
ON public.video_reports
FOR UPDATE
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());
DROP POLICY IF EXISTS "Admins can delete any video" ON public.videos;
CREATE POLICY "Admins can delete any video"
ON public.videos
FOR DELETE
USING (public.is_current_user_admin());
