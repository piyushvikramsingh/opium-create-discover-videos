import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Cast to any to bypass missing table types for collections/collection_videos
const db: any = supabase;

// Fetch user's collections
export const useCollections = (userId?: string) => {
  return useQuery({
    queryKey: ["collections", userId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) throw new Error("Not authenticated");

      const { data, error } = await db
        .from("collections")
        .select("*")
        .eq("user_id", targetUserId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!userId || undefined,
  });
};

// Fetch a specific collection with videos
export const useCollection = (collectionId: string) => {
  return useQuery({
    queryKey: ["collection", collectionId],
    queryFn: async () => {
      const { data, error } = await db
        .from("collections")
        .select(`
          *,
          collection_videos (
            id,
            added_at,
            videos (
              id,
              video_url,
              thumbnail_url,
              description,
              likes_count,
              comments_count,
              views_count,
              profiles (
                id,
                username,
                display_name,
                avatar_url,
                is_verified
              )
            )
          )
        `)
        .eq("id", collectionId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!collectionId,
  });
};

// Create a new collection
export const useCreateCollection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      is_public?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await db
        .from("collections")
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
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast({
        title: "Collection created",
        description: "Your new collection has been created",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create collection",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Update a collection
export const useUpdateCollection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      description?: string;
      is_public?: boolean;
      cover_url?: string;
    }) => {
      const { id, ...updates } = params;

      const { data, error } = await db
        .from("collections")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collection", data.id] });
      toast({
        title: "Collection updated",
        description: "Your collection has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update collection",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Delete a collection
export const useDeleteCollection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (collectionId: string) => {
      const { error } = await db
        .from("collections")
        .delete()
        .eq("id", collectionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast({
        title: "Collection deleted",
        description: "Your collection has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete collection",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Add video to collection
export const useAddVideoToCollection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      collection_id: string;
      video_id: string;
    }) => {
      const { data, error } = await db
        .from("collection_videos")
        .insert(params)
        .select()
        .single();

      if (error) throw error;

      // Update video count
      await db.rpc("increment_collection_video_count", {
        collection_id: params.collection_id,
      });

      return data;
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["collection", variables.collection_id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast({
        title: "Added to collection",
        description: "Video has been saved to your collection",
      });
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast({
          title: "Already in collection",
          description: "This video is already in the collection",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to add video",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });
};

// Remove video from collection
export const useRemoveVideoFromCollection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      collection_id: string;
      video_id: string;
    }) => {
      const { error } = await db
        .from("collection_videos")
        .delete()
        .eq("collection_id", params.collection_id)
        .eq("video_id", params.video_id);

      if (error) throw error;

      // Update video count
      await db.rpc("decrement_collection_video_count", {
        collection_id: params.collection_id,
      });
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["collection", variables.collection_id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast({
        title: "Removed from collection",
        description: "Video has been removed from the collection",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove video",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
