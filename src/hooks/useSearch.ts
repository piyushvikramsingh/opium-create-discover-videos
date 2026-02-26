import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useToast } from "@/hooks/use-toast";
import { buildOrIlikeClause, escapeIlikePattern, normalizeSearchInput } from "@/lib/search";

// Global search (videos, users, hashtags)
export const useGlobalSearch = (query: string, type?: string) => {
  return useQuery({
    queryKey: ["global-search", query, type],
    queryFn: async () => {
      const normalizedQuery = normalizeSearchInput(query);
      if (!normalizedQuery || normalizedQuery.length < 2) return null;
      const escapedPattern = escapeIlikePattern(normalizedQuery);

      const results: any = {
        videos: [],
        users: [],
        hashtags: [],
      };

      // Search videos
      if (!type || type === "video") {
        const { data: videos } = await supabase
          .from("videos")
          .select(`
            *,
            profiles!videos_user_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              is_verified
            )
          `)
          .or(buildOrIlikeClause(["description", "location", "music"], normalizedQuery))
          .order("likes_count", { ascending: false })
          .limit(40);

        const hashtagNeedle = normalizedQuery.toLowerCase();
        const mergedVideos = (videos || [])
          .filter((video: any) => {
            const hashtags = Array.isArray(video.hashtags) ? video.hashtags.map((tag: string) => tag.toLowerCase()) : [];
            return hashtags.some((tag: string) => tag === hashtagNeedle || tag.includes(hashtagNeedle));
          })
          .slice(0, 20)
          .concat(
            (videos || [])
              .filter((video: any) => {
                const text = `${video.description || ""} ${video.location || ""} ${video.music || ""}`.toLowerCase();
                return text.includes(hashtagNeedle);
              })
              .slice(0, 20),
          );

        const seenVideoIds = new Set<string>();
        results.videos = mergedVideos.filter((video: any) => {
          if (seenVideoIds.has(video.id)) return false;
          seenVideoIds.add(video.id);
          return true;
        }).slice(0, 20);
      }

      // Search users
      if (!type || type === "user") {
        const { data: users } = await supabase
          .from("profiles")
          .select("*")
          .or(buildOrIlikeClause(["username", "display_name"], normalizedQuery))
          .limit(20);

        results.users = users || [];
      }

      // Search hashtags
      if (!type || type === "hashtag") {
        const { data: hashtags } = await supabase
          .from("trending_hashtags")
          .select("*")
          .ilike("hashtag", `%${escapedPattern}%`)
          .order("trend_score", { ascending: false })
          .limit(10);

        results.hashtags = hashtags || [];
      }

      return results;
    },
    enabled: query.length >= 2,
  });
};

// Search history
export const useSearchHistory = () => {
  return useQuery({
    queryKey: ["search-history"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("search_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });
};

// Add to search history
export const useAddToSearchHistory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      query: string;
      search_type?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("search_history").insert({
        user_id: user.id,
        ...params,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search-history"] });
    },
  });
};

// Clear search history
export const useClearSearchHistory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search-history"] });
      toast({
        title: "Search history cleared",
        description: "Your search history has been deleted",
      });
    },
  });
};

// Trending hashtags
export const useTrendingHashtags = (limit: number = 20) => {
  return useQuery({
    queryKey: ["trending-hashtags", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trending_hashtags")
        .select("*")
        .order("trend_score", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  });
};

// Follow/unfollow hashtag
export const useFollowHashtag = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (hashtag: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("hashtag_follows")
        .insert({
          user_id: user.id,
          hashtag: hashtag.toLowerCase(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followed-hashtags"] });
      toast({
        title: "Hashtag followed",
        description: "You'll see posts with this hashtag in your feed",
      });
    },
  });
};

export const useUnfollowHashtag = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (hashtag: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("hashtag_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("hashtag", hashtag.toLowerCase());

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followed-hashtags"] });
      toast({
        title: "Hashtag unfollowed",
        description: "You won't see this hashtag in your feed anymore",
      });
    },
  });
};

// Get followed hashtags
export const useFollowedHashtags = () => {
  return useQuery({
    queryKey: ["followed-hashtags"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("hashtag_follows")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};
