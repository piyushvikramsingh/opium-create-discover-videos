import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useToast } from "@/hooks/use-toast";

export const usePolls = () =>
  useQuery({
    queryKey: ["polls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useCreatePoll = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      question: string;
      options: string[];
      video_id?: string | null;
      story_id?: string | null;
      expires_at?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("polls")
        .insert({ ...params, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      toast({ title: "Poll created", description: "Your poll is now live." });
    },
  });
};

export const useVotePoll = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { pollId: string; optionIndex: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: voteError } = await supabase.from("poll_votes").insert({
        poll_id: params.pollId,
        user_id: user.id,
        option_index: params.optionIndex,
      });
      if (voteError) throw voteError;

      const { data: poll, error: pollError } = await supabase
        .from("polls")
        .select("total_votes")
        .eq("id", params.pollId)
        .single();
      if (pollError) throw pollError;

      const { error: updateError } = await supabase
        .from("polls")
        .update({ total_votes: (poll.total_votes ?? 0) + 1 })
        .eq("id", params.pollId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      toast({ title: "Vote submitted", description: "Your vote has been counted." });
    },
  });
};

export const useChallenges = () =>
  useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useCreateChallenge = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      hashtag: string;
      description?: string | null;
      end_date?: string | null;
      prize_description?: string | null;
      thumbnail_url?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("challenges")
        .insert({ ...params, creator_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      toast({ title: "Challenge created", description: "Your challenge is now live." });
    },
  });
};

export const useJoinChallenge = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { challengeId: string; videoId?: string | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("challenge_participants").insert({
        challenge_id: params.challengeId,
        user_id: user.id,
        video_id: params.videoId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      toast({ title: "Joined challenge", description: "You are now participating." });
    },
  });
};
