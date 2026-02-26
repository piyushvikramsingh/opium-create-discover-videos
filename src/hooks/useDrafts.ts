import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useToast } from "@/hooks/use-toast";

// Fetch user's drafts
export const useDrafts = () => {
  return useQuery({
    queryKey: ["video-drafts"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("video_drafts")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

// Fetch a specific draft
export const useDraft = (draftId: string) => {
  return useQuery({
    queryKey: ["video-draft", draftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_drafts")
        .select("*")
        .eq("id", draftId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!draftId,
  });
};

// Create a draft
export const useCreateDraft = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      media_url?: string;
      thumbnail_url?: string;
      description?: string;
      hashtags?: string[];
      mentions?: string[];
      location?: string;
      music_id?: string;
      draft_data?: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("video_drafts")
        .insert({
          user_id: user.id,
          ...params,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-drafts"] });
      toast({
        title: "Draft saved",
        description: "Your video has been saved as a draft",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Update a draft
export const useUpdateDraft = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      media_url?: string;
      thumbnail_url?: string;
      description?: string;
      hashtags?: string[];
      mentions?: string[];
      location?: string;
      music_id?: string;
      draft_data?: any;
    }) => {
      const { id, ...updates } = params;

      const { data, error } = await supabase
        .from("video_drafts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["video-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["video-draft", data.id] });
      toast({
        title: "Draft updated",
        description: "Your changes have been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Delete a draft
export const useDeleteDraft = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await supabase
        .from("video_drafts")
        .delete()
        .eq("id", draftId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-drafts"] });
      toast({
        title: "Draft deleted",
        description: "Your draft has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Scheduled Posts
export const useScheduledPosts = () => {
  return useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_for", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
};

// Create scheduled post
export const useSchedulePost = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      video_url: string;
      thumbnail_url?: string;
      description?: string;
      scheduled_for: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("scheduled_posts")
        .insert({
          user_id: user.id,
          ...params,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });
      toast({
        title: "Post scheduled",
        description: "Your video will be published at the scheduled time",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to schedule post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Cancel scheduled post
export const useCancelScheduledPost = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ status: "cancelled" })
        .eq("id", postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });
      toast({
        title: "Post cancelled",
        description: "Your scheduled post has been cancelled",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
