import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

const isSchemaMismatchError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

export interface VideoComment {
  id: string;
  user_id: string;
  video_id: string;
  content: string;
  created_at: string;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

function updateVideosCommentsCount(
  queryClient: ReturnType<typeof useQueryClient>,
  videoId: string,
  delta: number,
) {
  queryClient.setQueryData<any[]>(["videos"], (currentVideos) => {
    if (!currentVideos) return currentVideos;

    return currentVideos.map((video) => {
      if (video.id !== videoId) return video;
      return {
        ...video,
        comments_count: Math.max(0, (video.comments_count ?? 0) + delta),
      };
    });
  });
}

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
      const advanced = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (!advanced.error) return advanced.data;
      if (!isSchemaMismatchError(advanced.error)) throw advanced.error;

      const fallback = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data;
    },
  });
}

export function useTaggedVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["tagged-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const tagged = await supabase
        .from("tagged_videos")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });

      if (tagged.error) {
        if (isSchemaMismatchError(tagged.error)) return [];
        throw tagged.error;
      }

      const ids = (tagged.data || []).map((row: any) => row.video_id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase.from("videos").select("*").in("id", ids);
      if (error) throw error;
      const map = new Map((data || []).map((video: any) => [video.id, video]));
      return ids.map((id: string) => map.get(id)).filter(Boolean);
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

export function useVideoComments(videoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["video-comments", videoId],
    enabled: !!videoId && enabled,
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from("comments")
        .select("id, user_id, video_id, content, created_at")
        .eq("video_id", videoId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!comments || comments.length === 0) return [] as VideoComment[];

      const userIds = [...new Set(comments.map((comment) => comment.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

      return comments.map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) ?? null,
      })) as VideoComment[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, content }: { videoId: string; content: string }) => {
      if (!user) throw new Error("Not authenticated");

      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("Comment cannot be empty");
      }

      const { error } = await supabase
        .from("comments")
        .insert({
          user_id: user.id,
          video_id: videoId,
          content: trimmedContent,
        });

      if (error) throw error;
    },
    onMutate: async ({ videoId, content }) => {
      await qc.cancelQueries({ queryKey: ["video-comments", videoId] });
      await qc.cancelQueries({ queryKey: ["videos"] });

      const previousComments = qc.getQueryData<VideoComment[]>(["video-comments", videoId]);
      const previousVideos = qc.getQueryData<any[]>(["videos"]);

      const optimisticComment: VideoComment = {
        id: `optimistic-${Date.now()}`,
        user_id: user?.id ?? "",
        video_id: videoId,
        content: content.trim(),
        created_at: new Date().toISOString(),
        profile: null,
      };

      qc.setQueryData<VideoComment[]>(["video-comments", videoId], (currentComments) => [
        optimisticComment,
        ...(currentComments ?? []),
      ]);

      updateVideosCommentsCount(qc, videoId, 1);

      return { previousComments, previousVideos };
    },
    onError: (_error, variables, context) => {
      if (context?.previousComments) {
        qc.setQueryData(["video-comments", variables.videoId], context.previousComments);
      }
      if (context?.previousVideos) {
        qc.setQueryData(["videos"], context.previousVideos);
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, commentId }: { videoId: string; commentId: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onMutate: async ({ videoId, commentId }) => {
      await qc.cancelQueries({ queryKey: ["video-comments", videoId] });
      await qc.cancelQueries({ queryKey: ["videos"] });

      const previousComments = qc.getQueryData<VideoComment[]>(["video-comments", videoId]);
      const previousVideos = qc.getQueryData<any[]>(["videos"]);

      qc.setQueryData<VideoComment[]>(["video-comments", videoId], (currentComments) => {
        if (!currentComments) return currentComments;
        return currentComments.filter((comment) => comment.id !== commentId);
      });

      updateVideosCommentsCount(qc, videoId, -1);

      return { previousComments, previousVideos };
    },
    onError: (_error, variables, context) => {
      if (context?.previousComments) {
        qc.setQueryData(["video-comments", variables.videoId], context.previousComments);
      }
      if (context?.previousVideos) {
        qc.setQueryData(["videos"], context.previousVideos);
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
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
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useFollowersList(userId: string | undefined) {
  return useQuery({
    queryKey: ["followers-list", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId!);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((row: any) => row.follower_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      if (pErr) throw pErr;
      return profiles || [];
    },
  });
}

export function useFollowingList(userId: string | undefined) {
  return useQuery({
    queryKey: ["following-list", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId!);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((row: any) => row.following_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      if (pErr) throw pErr;
      return profiles || [];
    },
  });
}

export function useFollowRequestStatus(targetUserId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["follow-request-status", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_requests")
        .select("id, status")
        .eq("follower_id", user!.id)
        .eq("following_id", targetUserId!)
        .maybeSingle();

      if (error) {
        if (isSchemaMismatchError(error)) return null;
        throw error;
      }

      return data;
    },
  });
}

export function useIncomingFollowRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["incoming-follow-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("follow_requests")
        .select("id, follower_id, following_id, status, created_at")
        .eq("following_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const followerIds = [...new Set((requests || []).map((row: any) => row.follower_id))];
      if (followerIds.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", followerIds);
      if (pErr) throw pErr;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (requests || []).map((request: any) => ({
        ...request,
        profile: profileMap.get(request.follower_id) || null,
      }));
    },
  });
}

export function useRespondFollowRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, followerId, accept }: { requestId: string; followerId: string; accept: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      if (accept) {
        const { error: followErr } = await supabase
          .from("follows")
          .insert({ follower_id: followerId, following_id: user.id });
        if (followErr) throw followErr;
      }

      const { error } = await supabase
        .from("follow_requests")
        .update({ status: accept ? "accepted" : "rejected" })
        .eq("id", requestId)
        .eq("following_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incoming-follow-requests"] });
      qc.invalidateQueries({ queryKey: ["follow-counts"] });
      qc.invalidateQueries({ queryKey: ["is-following"] });
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
    mutationFn: async ({
      targetUserId,
      isFollowing,
      targetIsPrivate,
      hasPendingRequest,
    }: {
      targetUserId: string;
      isFollowing: boolean;
      targetIsPrivate?: boolean;
      hasPendingRequest?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
        return "unfollowed";
      }

      if (targetIsPrivate) {
        if (hasPendingRequest) {
          const cancel = await supabase
            .from("follow_requests")
            .delete()
            .eq("follower_id", user.id)
            .eq("following_id", targetUserId)
            .eq("status", "pending");

          if (cancel.error && !isSchemaMismatchError(cancel.error)) throw cancel.error;
          return "request-cancelled";
        }

        const request = await supabase
          .from("follow_requests")
          .upsert(
            {
              follower_id: user.id,
              following_id: targetUserId,
              status: "pending",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "follower_id,following_id" },
          );

        if (request.error) {
          if (isSchemaMismatchError(request.error)) {
            await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
            return "followed";
          }
          throw request.error;
        }

        return "requested";
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
        return "followed";
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["is-following"] });
      qc.invalidateQueries({ queryKey: ["follow-request-status"] });
      qc.invalidateQueries({ queryKey: ["incoming-follow-requests"] });
      qc.invalidateQueries({ queryKey: ["follow-counts"] });
      qc.invalidateQueries({ queryKey: ["followers-list"] });
      qc.invalidateQueries({ queryKey: ["following-list"] });
    },
  });
}

export function useProfileHighlights(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-highlights", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_highlights")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useCreateHighlight() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, cover_url }: { title: string; cover_url?: string | null }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("profile_highlights").insert({
        user_id: user.id,
        title,
        cover_url: cover_url || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useDeleteHighlight() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ highlightId }: { highlightId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profile_highlights")
        .delete()
        .eq("id", highlightId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useProfileLinks(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-links", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_links")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useUpsertProfileLink() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      label,
      url,
      link_type,
    }: {
      id?: string;
      label: string;
      url: string;
      link_type?: "custom" | "affiliate" | "shop";
    }) => {
      if (!user) throw new Error("Not authenticated");

      const payload: any = {
        user_id: user.id,
        label,
        url,
        link_type: link_type || "custom",
      };
      if (id) payload.id = id;

      const { error } = await supabase.from("profile_links").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-links"] });
    },
  });
}

export function useDeleteProfileLink() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profile_links")
        .delete()
        .eq("id", linkId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-links"] });
    },
  });
}

export function useMutualFollowers(targetUserId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mutual-followers", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const [mine, target] = await Promise.all([
        supabase.from("follows").select("follower_id").eq("following_id", user!.id),
        supabase.from("follows").select("follower_id").eq("following_id", targetUserId!),
      ]);

      if (mine.error) throw mine.error;
      if (target.error) throw target.error;

      const mineSet = new Set((mine.data || []).map((row: any) => row.follower_id));
      const mutualIds = (target.data || [])
        .map((row: any) => row.follower_id)
        .filter((id: string) => mineSet.has(id));

      if (mutualIds.length === 0) return [];

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", mutualIds.slice(0, 5));
      if (error) throw error;
      return profiles || [];
    },
  });
}

export function useSuggestedUsers(limit = 8) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["suggested-users", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: following } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);

      const excluded = new Set<string>([user!.id, ...(following || []).map((row: any) => row.following_id)]);
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .limit(Math.max(limit * 2, 20));
      if (error) throw error;

      return (profiles || []).filter((profile: any) => !excluded.has(profile.user_id)).slice(0, limit);
    },
  });
}

export function useCreatorMetrics(userId: string | undefined) {
  return useQuery({
    queryKey: ["creator-metrics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: videos, error } = await supabase
        .from("videos")
        .select("id, likes_count, comments_count, shares_count")
        .eq("user_id", userId!);
      if (error) throw error;

      const totalPosts = (videos || []).length;
      const likes = (videos || []).reduce((sum: number, video: any) => sum + (video.likes_count || 0), 0);
      const comments = (videos || []).reduce((sum: number, video: any) => sum + (video.comments_count || 0), 0);
      const shares = (videos || []).reduce((sum: number, video: any) => sum + (video.shares_count || 0), 0);
      const engagement = likes + comments + shares;
      const reach = likes * 3 + comments * 5 + shares * 8;

      return {
        posts: totalPosts,
        likes,
        comments,
        shares,
        engagement,
        reach,
      };
    },
  });
}

export function useUpdateLastActive() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error && !isSchemaMismatchError(error)) throw error;
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
      avatar_url?: string | null;
      website_url?: string | null;
      category?: string | null;
      contact_email?: string | null;
      contact_phone?: string | null;
      affiliate_url?: string | null;
      shop_url?: string | null;
      is_private?: boolean;
      is_verified?: boolean;
      show_last_active?: boolean;
      professional_account?: boolean;
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

export function useTogglePinVideo() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isPinned }: { videoId: string; isPinned: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      const updateAttempt = await supabase
        .from("videos")
        .update({ is_pinned: !isPinned })
        .eq("id", videoId)
        .eq("user_id", user.id);

      if (updateAttempt.error) {
        if (isSchemaMismatchError(updateAttempt.error)) {
          throw new Error("Pinning requires latest database migration");
        }
        throw updateAttempt.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-videos"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}
