import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useToast } from "@/hooks/use-toast";

// Blocked Users
export const useBlockedUsers = () => {
  return useQuery({
    queryKey: ["blocked-users"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("blocked_users")
        .select(`
          *,
          profiles!blocked_users_blocked_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useBlockUser = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { blocked_id: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("blocked_users")
        .insert({
          blocker_id: user.id,
          ...params,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
      toast({
        title: "User blocked",
        description: "You won't see content from this user anymore",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to block user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useUnblockUser = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("blocked_users")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", blockedUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
      toast({
        title: "User unblocked",
        description: "You can now see content from this user",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to unblock user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Muted Words
export const useMutedWords = () => {
  return useQuery({
    queryKey: ["muted-words"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("muted_words")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useAddMutedWord = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (word: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("muted_words")
        .insert({
          user_id: user.id,
          word: word.toLowerCase(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muted-words"] });
      toast({
        title: "Word muted",
        description: "You won't see posts with this word",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to mute word",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useRemoveMutedWord = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (mutedWordId: string) => {
      const { error } = await supabase
        .from("muted_words")
        .delete()
        .eq("id", mutedWordId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muted-words"] });
      toast({
        title: "Word unmuted",
        description: "You can now see posts with this word",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to unmute word",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Close Friends
export const useCloseFriends = () => {
  return useQuery({
    queryKey: ["close-friends"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("close_friends")
        .select(`
          *,
          profiles!close_friends_friend_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useAddCloseFriend = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (friendId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("close_friends")
        .insert({
          user_id: user.id,
          friend_id: friendId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["close-friends"] });
      toast({
        title: "Added to close friends",
        description: "This user is now in your close friends list",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add close friend",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useRemoveCloseFriend = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (friendId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("close_friends")
        .delete()
        .eq("user_id", user.id)
        .eq("friend_id", friendId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["close-friends"] });
      toast({
        title: "Removed from close friends",
        description: "This user is no longer in your close friends list",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove close friend",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Check if user is blocked
export const useIsBlockedBy = (userId: string) => {
  return useQuery({
    queryKey: ["is-blocked-by", userId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from("blocked_users")
        .select("id")
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
        .or(`blocked_id.eq.${userId},blocker_id.eq.${userId}`)
        .limit(1);

      if (error) throw error;
      return (data?.length || 0) > 0;
    },
    enabled: !!userId,
  });
};
