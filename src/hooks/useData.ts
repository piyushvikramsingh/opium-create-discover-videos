import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export function useVideos() {
  return useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles!videos_user_id_fkey(username, display_name, avatar_url)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUserVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUserLikes(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-likes", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("likes")
        .select("video_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set(data.map((l) => l.video_id));
    },
  });
}

export function useUserBookmarks(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-bookmarks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("video_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set(data.map((b) => b.video_id));
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isLiked }: { videoId: string; isLiked: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (isLiked) {
        await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", videoId);
      } else {
        await supabase.from("likes").insert({ user_id: user.id, video_id: videoId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-likes"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useToggleBookmark() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isBookmarked }: { videoId: string; isBookmarked: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (isBookmarked) {
        await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("video_id", videoId);
      } else {
        await supabase.from("bookmarks").insert({ user_id: user.id, video_id: videoId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-bookmarks"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useFollowCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ["follow-counts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [followers, following] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId!),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId!),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      };
    },
  });
}

export function useIsFollowing(targetUserId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-following", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user!.id)
        .eq("following_id", targetUserId!)
        .maybeSingle();
      return !!data;
    },
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ targetUserId, isFollowing }: { targetUserId: string; isFollowing: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["is-following"] });
      qc.invalidateQueries({ queryKey: ["follow-counts"] });
    },
  });
}

export function useLikedVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["liked-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: likes, error: lErr } = await supabase
        .from("likes")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (lErr) throw lErr;
      if (!likes || likes.length === 0) return [];
      const ids = likes.map((l) => l.video_id);
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      // Preserve order from likes
      const map = new Map((data || []).map((v) => [v.id, v]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    },
  });
}

export function useBookmarkedVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["bookmarked-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: bookmarks, error: bErr } = await supabase
        .from("bookmarks")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (bErr) throw bErr;
      if (!bookmarks || bookmarks.length === 0) return [];
      const ids = bookmarks.map((b) => b.video_id);
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      const map = new Map((data || []).map((v) => [v.id, v]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: {
      display_name?: string;
      username?: string;
      bio?: string;
      avatar_url?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
