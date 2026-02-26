-- Inbox notes (24h status text shown above messages).

CREATE TABLE IF NOT EXISTS public.inbox_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_notes_user_unique ON public.inbox_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_notes_expires_at ON public.inbox_notes(expires_at);
ALTER TABLE public.inbox_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own and followed inbox notes" ON public.inbox_notes;
CREATE POLICY "Users can view own and followed inbox notes"
ON public.inbox_notes FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.follows f
    WHERE f.follower_id = auth.uid()
      AND f.following_id = inbox_notes.user_id
  )
);
DROP POLICY IF EXISTS "Users can insert own inbox notes" ON public.inbox_notes;
CREATE POLICY "Users can insert own inbox notes"
ON public.inbox_notes FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own inbox notes" ON public.inbox_notes;
CREATE POLICY "Users can update own inbox notes"
ON public.inbox_notes FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own inbox notes" ON public.inbox_notes;
CREATE POLICY "Users can delete own inbox notes"
ON public.inbox_notes FOR DELETE
USING (user_id = auth.uid());
