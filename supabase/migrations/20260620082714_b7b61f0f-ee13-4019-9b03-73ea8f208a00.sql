
-- Replace public read with conversation-participant-only access on chat-media
DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat media" ON storage.objects;

-- Read: only conversation participants (or the uploader/owner of the folder) can read
CREATE POLICY "Chat media readable by conversation participants"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = auth.uid()
        AND (
          m.media_url = name
          OR m.media_url LIKE '%/chat-media/' || name
          OR m.media_url LIKE '%/chat-media/' || name || '?%'
        )
    )
  )
);

-- Upload: only to own folder
CREATE POLICY "Users can upload chat media to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Update: only own files
CREATE POLICY "Users can update own chat media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Delete: only own files
CREATE POLICY "Users can delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
