-- Complete RLS policies and helper functions for engagement, live, and monetization features

-- =========================
-- Helper functions
-- =========================
CREATE OR REPLACE FUNCTION public.increment_poll_total_votes(target_poll_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.polls
  SET total_votes = COALESCE(total_votes, 0) + 1
  WHERE id = target_poll_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.generate_stream_key()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text);
$$;
-- =========================
-- Engagement policies
-- =========================
CREATE POLICY "Users can view polls"
ON public.polls FOR SELECT
USING (true);
CREATE POLICY "Users can create own polls"
ON public.polls FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own polls"
ON public.polls FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view poll votes"
ON public.poll_votes FOR SELECT
USING (true);
CREATE POLICY "Users can vote once as self"
ON public.poll_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view challenges"
ON public.challenges FOR SELECT
USING (true);
CREATE POLICY "Users can create own challenges"
ON public.challenges FOR INSERT
WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own challenges"
ON public.challenges FOR UPDATE
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can view challenge participants"
ON public.challenge_participants FOR SELECT
USING (true);
CREATE POLICY "Users can join challenges as self"
ON public.challenge_participants FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own challenge entry"
ON public.challenge_participants FOR DELETE
USING (auth.uid() = user_id);
-- =========================
-- Live streaming policies
-- =========================
CREATE POLICY "Users can view live comments"
ON public.live_comments FOR SELECT
USING (true);
CREATE POLICY "Users can create own live comments"
ON public.live_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own live comments"
ON public.live_comments FOR DELETE
USING (auth.uid() = user_id);
CREATE POLICY "Users can view live viewers"
ON public.live_viewers FOR SELECT
USING (true);
CREATE POLICY "Users can join streams as self"
ON public.live_viewers FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own live viewer record"
ON public.live_viewers FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
-- =========================
-- Monetization policies
-- =========================
CREATE POLICY "Users can view own tiers and public active tiers"
ON public.subscription_tiers FOR SELECT
USING (user_id = auth.uid() OR COALESCE(is_active, true) = true);
CREATE POLICY "Users can manage own tiers"
ON public.subscription_tiers FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can create subscriptions as self"
ON public.subscriptions FOR INSERT
WITH CHECK (auth.uid() = subscriber_id);
CREATE POLICY "Users can create tips as self"
ON public.tips FOR INSERT
WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users can view sent and received tips"
ON public.tips FOR SELECT
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
-- Message reactions (advanced messaging support)
CREATE POLICY "Users can view message reactions in conversations"
ON public.message_reactions FOR SELECT
USING (true);
CREATE POLICY "Users can react as self"
ON public.message_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);
