
-- Create a dedicated chat-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-media bucket
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Chat media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete own chat media"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update messages (mark snaps as viewed)
CREATE POLICY "Users can update messages in own conversations"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);
