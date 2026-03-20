import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  preview_url: string | null;
  duration_seconds: number;
  cover_url: string | null;
  is_trending: boolean;
}

export function useMusicTracks(search = "") {
  return useQuery({
    queryKey: ["music-tracks", search],
    queryFn: async () => {
      let query = (supabase as any).from("music_tracks").select("*").order("is_trending", { ascending: false });
      if (search.trim()) {
        query = query.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
      }
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return (data ?? []) as MusicTrack[];
    },
  });
}
