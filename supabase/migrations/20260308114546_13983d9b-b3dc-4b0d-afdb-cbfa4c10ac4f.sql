
-- Broadcast channels table
CREATE TABLE public.broadcast_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key to profiles
ALTER TABLE public.broadcast_channels
  ADD CONSTRAINT broadcast_channels_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Broadcast subscriptions table
CREATE TABLE public.broadcast_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Inbox notes table (if not exists)
CREATE TABLE IF NOT EXISTS public.inbox_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.broadcast_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_notes ENABLE ROW LEVEL SECURITY;

-- Broadcast channels policies
CREATE POLICY "Channels viewable by everyone" ON public.broadcast_channels FOR SELECT USING (true);
CREATE POLICY "Users can create own channels" ON public.broadcast_channels FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own channels" ON public.broadcast_channels FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own channels" ON public.broadcast_channels FOR DELETE USING (auth.uid() = creator_id);

-- Broadcast subscriptions policies
CREATE POLICY "Subscriptions viewable by subscriber" ON public.broadcast_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can subscribe" ON public.broadcast_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsubscribe" ON public.broadcast_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- Inbox notes policies
CREATE POLICY "Notes viewable by authenticated" ON public.inbox_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can upsert own notes" ON public.inbox_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.inbox_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.inbox_notes FOR DELETE USING (auth.uid() = user_id);

-- Trigger to update subscriber count
CREATE OR REPLACE FUNCTION public.handle_broadcast_subscription_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.broadcast_channels SET subscriber_count = subscriber_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.broadcast_channels SET subscriber_count = subscriber_count - 1 WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER on_broadcast_subscription_change
AFTER INSERT OR DELETE ON public.broadcast_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.handle_broadcast_subscription_count();
