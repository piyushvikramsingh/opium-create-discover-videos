-- Add conversation-level acceptance state for DM message requests.

ALTER TABLE public.conversation_settings
  ADD COLUMN IF NOT EXISTS accepted_request BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_conversation_settings_user_accepted
  ON public.conversation_settings(user_id, accepted_request);
