import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Fetch stories from followed users and own stories
export const useStories = () => {
  return useQuery({
    queryKey: ["stories"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const rpcFeed = await (supabase as any).rpc("get_story_feed");
      if (!rpcFeed.error && Array.isArray(rpcFeed.data)) {
        const storiesByUser = rpcFeed.data.reduce((acc: any, story: any) => {
          const userId = story.user_id;
          if (!acc[userId]) {
            acc[userId] = {
              user: {
                id: userId,
                username: story.user_username,
                display_name: story.user_display_name,
                avatar_url: story.user_avatar_url,
                is_verified: !!story.user_is_verified,
              },
              stories: [],
              hasUnviewed: false,
              hasCloseFriendsStory: false,
            };
          }
          acc[userId].stories.push({
            ...story,
            viewed: !!story.viewed,
          });
          if (!story.viewed) acc[userId].hasUnviewed = true;
          if (story.audience === "close_friends") acc[userId].hasCloseFriendsStory = true;
          return acc;
        }, {} as Record<string, any>);

        return Object.values(storiesByUser || {});
      }

      // Get stories from followed users + own stories
      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          profiles!stories_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          ),
          story_views!left (
            id,
            viewer_id
          )
        `)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group stories by user
      const storiesByUser = data?.reduce((acc: any, story: any) => {
        const userId = story.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            user: story.profiles,
            stories: [],
            hasUnviewed: false,
            hasCloseFriendsStory: false,
          };
        }
        const viewedByMe = story.story_views?.some(
          (view: any) => view.viewer_id === user.id
        );
        acc[userId].stories.push({ ...story, viewed: viewedByMe });
        if (!viewedByMe) acc[userId].hasUnviewed = true;
        if (story.audience === "close_friends") acc[userId].hasCloseFriendsStory = true;
        return acc;
      }, {});

      return Object.values(storiesByUser || {});
    },
  });
};

// Fetch specific user's stories
export const useUserStories = (userId: string) => {
  return useQuery({
    queryKey: ["stories", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("*, story_views!left (viewer_id)")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
};

// Create a new story
export const useCreateStory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      media_url: string;
      media_type: "image" | "video";
      thumbnail_url?: string;
      caption?: string;
      background_color?: string;
      duration?: number;
      audience?: "followers" | "close_friends";
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = {
        user_id: user.id,
        ...params,
      } as any;

      const { data, error } = await (supabase as any)
        .from("stories")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast({
        title: "Story posted",
        description: "Your story has been shared with your followers",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to post story",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useCloseFriends = () => {
  return useQuery({
    queryKey: ["close-friends"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("close_friends")
        .select("id, friend_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const ids = Array.from(new Set((data || []).map((row: any) => row.friend_id))) as string[];
      if (ids.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (data || []).map((row: any) => ({
        ...row,
        profile: profileMap.get(row.friend_id) || null,
      }));
    },
  });
};

export const useCloseFriendCandidates = (searchQuery = "", limit = 100) => {
  return useQuery({
    queryKey: ["close-friend-candidates", searchQuery, limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const rpc = await (supabase as any).rpc("get_close_friend_candidates", {
        search_query: searchQuery,
        limit_count: limit,
      });

      if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;

      const { data: followingRows, error: followError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      if (followError) throw followError;

      const followingIds = Array.from(new Set((followingRows || []).map((row: any) => row.following_id)));
      if (followingIds.length === 0) return [];

      const [profilesRes, closeFriendsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", followingIds)
          .limit(limit),
        (supabase as any)
          .from("close_friends")
          .select("friend_id")
          .eq("user_id", user.id),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (closeFriendsRes.error) throw closeFriendsRes.error;

      const closeSet = new Set((closeFriendsRes.data || []).map((row: any) => row.friend_id));
      const q = searchQuery.trim().toLowerCase();

      return (profilesRes.data || [])
        .filter((profile: any) => {
          if (!q) return true;
          return (
            String(profile.username || "").toLowerCase().includes(q) ||
            String(profile.display_name || "").toLowerCase().includes(q)
          );
        })
        .map((profile: any) => ({
          ...profile,
          is_close_friend: closeSet.has(profile.user_id),
        }));
    },
  });
};

export const useToggleCloseFriend = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId, isCloseFriend }: { targetUserId: string; isCloseFriend: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (isCloseFriend) {
        const { error } = await (supabase as any)
          .from("close_friends")
          .delete()
          .eq("user_id", user.id)
          .eq("friend_id", targetUserId);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase as any)
        .from("close_friends")
        .insert({
          user_id: user.id,
          friend_id: targetUserId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["close-friends"] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });
};

// Delete a story
export const useDeleteStory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", storyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast({
        title: "Story deleted",
        description: "Your story has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete story",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Mark story as viewed
export const useViewStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("story_views")
        .upsert({
          story_id: storyId,
          viewer_id: user.id,
        }, { onConflict: "story_id,viewer_id" });

      if (error) throw error;

      // Update view count
      await supabase.rpc("increment_story_view_count", { story_id: storyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });
};

// Get story viewers
export const useStoryViewers = (storyId: string) => {
  return useQuery({
    queryKey: ["story-viewers", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_views")
        .select(`
          *,
          profiles!story_views_viewer_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq("story_id", storyId)
        .order("viewed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!storyId,
  });
};

// Get story replies (for story owner insights)
export const useStoryReplies = (storyId: string) => {
  return useQuery({
    queryKey: ["story-replies", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_replies")
        .select("*")
        .eq("story_id", storyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const senderIds = Array.from(new Set((data || []).map((reply: any) => reply.sender_id)));
      if (senderIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, is_verified")
        .in("user_id", senderIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (data || []).map((reply: any) => ({
        ...reply,
        sender_profile: profileMap.get(reply.sender_id) || null,
      }));
    },
    enabled: !!storyId,
  });
};

// Reply to a story
export const useReplyToStory = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      story_id: string;
      message: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("story_replies")
        .insert({
          story_id: params.story_id,
          sender_id: user.id,
          message: params.message,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Reply sent",
        description: "Your reply was sent to inbox",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
