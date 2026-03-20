import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ArchivedStory {
  id: string;
  user_id: string;
  original_story_id: string | null;
  media_url: string;
  media_type: string;
  thumbnail_url: string | null;
  caption: string | null;
  background_color: string | null;
  duration: number;
  audience: string;
  stickers: any[];
  original_created_at: string;
  archived_at: string;
}

export function useStoryArchive() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["story-archive", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("story_archive")
        .select("*")
        .eq("user_id", user!.id)
        .order("original_created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ArchivedStory[];
    },
  });
}

export function useArchiveStory() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (story: {
      original_story_id?: string;
      media_url: string;
      media_type: string;
      thumbnail_url?: string;
      caption?: string;
      background_color?: string;
      duration?: number;
      audience?: string;
      stickers?: any[];
      original_created_at?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("story_archive").insert({
        user_id: user.id,
        original_story_id: story.original_story_id || null,
        media_url: story.media_url,
        media_type: story.media_type,
        thumbnail_url: story.thumbnail_url || null,
        caption: story.caption || null,
        background_color: story.background_color || null,
        duration: story.duration || 5,
        audience: story.audience || "followers",
        stickers: story.stickers || [],
        original_created_at: story.original_created_at || new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-archive"] });
      toast.success("Story archived!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteArchivedStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("story_archive").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-archive"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReshareArchivedStory() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (archived: ArchivedStory) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: archived.media_url,
        media_type: archived.media_type,
        thumbnail_url: archived.thumbnail_url,
        caption: archived.caption,
        background_color: archived.background_color,
        duration: archived.duration,
        audience: archived.audience,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      toast.success("Story re-shared!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
