-- Drop the existing wrong FK
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_user_id_fkey;

-- Add unique constraint on profiles.user_id
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Re-create FK from videos.user_id to profiles.user_id
ALTER TABLE public.videos 
ADD CONSTRAINT videos_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;