import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

export interface Sound {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string | null;
  duration_ms: number;
  use_count: number;
  is_original: boolean;
  created_at: string;
}

export interface RemixInfo {
  id: string;
  original_video_id: string;
  remix_video_id: string;
  remix_type: "stitch" | "duet";
  clip_start_ms: number | null;
  clip_end_ms: number | null;
  created_at: string;
  original_video?: {
    id: string;
    description: string;
    thumbnail_url: string;
    profiles?: { username: string; avatar_url: string };
  };
}

// ── Sounds ─────────────────────────────────────────────────────────────

/**
 * Fetch trending sounds
 */
export function useTrendingSounds(limit = 20) {
  return useQuery({
    queryKey: ["sounds", "trending", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sounds")
        .select("*")
        .order("use_count", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as Sound[];
    },
  });
}

/**
 * Search sounds by title or artist
 */
export function useSearchSounds(query: string) {
  return useQuery({
    queryKey: ["sounds", "search", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sounds")
        .select("*")
        .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
        .order("use_count", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data ?? []) as Sound[];
    },
  });
}

/**
 * Fetch a specific sound by ID
 */
export function useSound(soundId: string) {
  return useQuery({
    queryKey: ["sounds", soundId],
    enabled: !!soundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sounds")
        .select("*")
        .eq("id", soundId)
        .single();

      if (error) throw error;
      return data as Sound;
    },
  });
}

/**
 * Fetch videos that use a specific sound.
 */
export function useVideosBySound(soundId: string, limit = 30) {
  return useQuery({
    queryKey: ["sounds", soundId, "videos"],
    enabled: !!soundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, description, thumbnail_url, video_url, likes_count, profiles(username, avatar_url)")
        .eq("sound_id", soundId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Stitch & Duet ──────────────────────────────────────────────────────

/**
 * Create a stitch (clip from another video + your own content).
 */
export function useCreateStitch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalVideoId,
      newVideoId,
      stitchStartMs,
      stitchEndMs,
    }: {
      originalVideoId: string;
      newVideoId: string;
      stitchStartMs: number;
      stitchEndMs: number;
    }) => {
      const { error } = await supabase.from("video_remixes").insert({
        original_video_id: originalVideoId,
        remix_video_id: newVideoId,
        remix_type: "stitch",
        clip_start_ms: stitchStartMs,
        clip_end_ms: stitchEndMs,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Stitch created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Create a duet (side-by-side with another video).
 */
export function useCreateDuet() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalVideoId,
      newVideoId,
    }: {
      originalVideoId: string;
      newVideoId: string;
    }) => {
      const { error } = await supabase.from("video_remixes").insert({
        original_video_id: originalVideoId,
        remix_video_id: newVideoId,
        remix_type: "duet",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Duet created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Get remix info for a video (is it a stitch/duet? what was the original?).
 */
export function useRemixInfo(videoId: string) {
  return useQuery({
    queryKey: ["remix-info", videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_remixes")
        .select(
          `
          id, original_video_id, remix_video_id, remix_type,
          clip_start_ms, clip_end_ms, created_at,
          videos!video_remixes_original_video_id_fkey(
            id, description, thumbnail_url,
            profiles(username, avatar_url)
          )
        `
        )
        .eq("remix_video_id", videoId)
        .maybeSingle();

      if (error) throw error;
      return data as RemixInfo | null;
    },
  });
}

// ── Auto Captions ──────────────────────────────────────────────────────

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Fetch auto-generated captions for a video.
 */
export function useVideoCaptions(videoId: string) {
  return useQuery({
    queryKey: ["captions", videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_captions")
        .select("*")
        .eq("video_id", videoId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        language: data.language as string,
        segments: ((data.segments as unknown as CaptionSegment[]) ?? []),
      };
    },
  });
}

/**
 * Request auto-caption generation for a video.
 */
export function useRequestCaptions() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ videoId }: { videoId: string }) => {
      // In production, this would trigger a serverless function
      const { error } = await supabase.from("video_captions").insert({
        video_id: videoId,
        language: "en",
        segments: [],
        status: "processing",
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["captions", vars.videoId] });
      toast.success("Captions are being generated...");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Carousel / Photo Posts ─────────────────────────────────────────────

/**
 * Fetch carousel items for a video/post.
 */
export function useCarouselItems(videoId: string) {
  return useQuery({
    queryKey: ["carousel", videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carousel_items")
        .select("*")
        .eq("video_id", videoId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Create carousel items for a post.
 */
export function useCreateCarouselItems() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      videoId,
      items,
    }: {
      videoId: string;
      items: Array<{ media_url: string; media_type: string; position: number }>;
    }) => {
      const rows = items.map((item) => ({
        video_id: videoId,
        media_url: item.media_url,
        media_type: item.media_type,
        sort_order: item.position,
      }));
      const { error } = await supabase.from("carousel_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["carousel", vars.videoId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
