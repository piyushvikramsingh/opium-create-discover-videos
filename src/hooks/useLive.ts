import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useToast } from "@/hooks/use-toast";

const createStreamKey = () =>
  (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 48);

export const useLiveStreams = () =>
  useQuery({
    queryKey: ["live-streams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_streams")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useCreateLiveStream = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string | null;
      thumbnail_url?: string | null;
      scheduled_start?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("live_streams")
        .insert({
          ...params,
          user_id: user.id,
          stream_key: createStreamKey(),
          status: params.scheduled_start ? "scheduled" : "live",
          started_at: params.scheduled_start ? null : new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-streams"] });
      toast({ title: "Live stream created", description: "Your stream is ready." });
    },
  });
};

export const useUpdateStreamStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { streamId: string; status: "live" | "ended" }) => {
      const payload: Record<string, string> = { status: params.status };
      if (params.status === "live") payload.started_at = new Date().toISOString();
      if (params.status === "ended") payload.ended_at = new Date().toISOString();

      const { error } = await supabase
        .from("live_streams")
        .update(payload)
        .eq("id", params.streamId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["live-streams"] }),
  });
};

export const useLiveComments = (streamId: string | null) =>
  useQuery({
    queryKey: ["live-comments", streamId],
    enabled: !!streamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_comments")
        .select("*")
        .eq("stream_id", streamId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

export const useSendLiveComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { streamId: string; content: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("live_comments").insert({
        stream_id: params.streamId,
        user_id: user.id,
        content: params.content,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["live-comments", vars.streamId] });
    },
  });
};
