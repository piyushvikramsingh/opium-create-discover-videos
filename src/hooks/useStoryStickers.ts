import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const getVisibilityAwarePollInterval = (activeMs: number, hiddenMs: number) => {
  if (typeof document === "undefined") return activeMs;
  return document.visibilityState === "visible" ? activeMs : hiddenMs;
};

// ── Types ──────────────────────────────────────────────────────────────

export type StickerType =
  | "poll"
  | "quiz"
  | "question"
  | "countdown"
  | "emoji_slider"
  | "link"
  | "mention"
  | "location"
  | "music";

export interface StorySticker {
  id: string;
  story_id: string;
  sticker_type: StickerType;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  data: Record<string, any>;
  created_at: string;
}

export interface PollVote {
  sticker_id: string;
  option_index: number;
}

export interface QuizAnswer {
  sticker_id: string;
  selected_index: number;
}

export interface QuestionResponse {
  sticker_id: string;
  response_text: string;
  user: {
    username: string;
    avatar_url: string | null;
  };
}

export interface EmojiSliderVote {
  sticker_id: string;
  value: number; // 0-1
}

// ── Fetch stickers for a story ─────────────────────────────────────────

export function useStoryStickers(storyId: string) {
  return useQuery({
    queryKey: ["story-stickers", storyId],
    enabled: !!storyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_stickers")
        .select("*")
        .eq("story_id", storyId)
        .order("created_at");

      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        story_id: row.story_id,
        sticker_type: row.sticker_type,
        position_x: row.position_x,
        position_y: row.position_y,
        rotation: row.rotation,
        scale: row.scale,
        data: row.payload ?? {},
        created_at: row.created_at,
      })) as StorySticker[];
    },
  });
}

// ── Poll Voting ────────────────────────────────────────────────────────

export function usePollResults(stickerId: string) {
  return useQuery({
    queryKey: ["poll-results", stickerId],
    enabled: !!stickerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_poll_votes")
        .select("option_index")
        .eq("sticker_id", stickerId);

      if (error) throw error;

      // Aggregate votes per option
      const counts: Record<number, number> = {};
      const total = data?.length ?? 0;
      for (const vote of data ?? []) {
        counts[vote.option_index] = (counts[vote.option_index] ?? 0) + 1;
      }

      return { counts, total };
    },
    refetchInterval: () => getVisibilityAwarePollInterval(15000, 60000),
    refetchOnWindowFocus: true,
  });
}

export function useVotePoll() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ sticker_id, option_index }: PollVote) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("story_poll_votes")
        .insert({ sticker_id, option_index, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["poll-results", vars.sticker_id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Quiz Answer ────────────────────────────────────────────────────────

export function useQuizResults(stickerId: string) {
  return useQuery({
    queryKey: ["quiz-results", stickerId],
    enabled: !!stickerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_quiz_answers")
        .select("selected_index")
        .eq("sticker_id", stickerId);

      if (error) throw error;

      const counts: Record<number, number> = {};
      const total = data?.length ?? 0;
      for (const answer of data ?? []) {
        counts[answer.selected_index] = (counts[answer.selected_index] ?? 0) + 1;
      }

      return { counts, total };
    },
    refetchInterval: () => getVisibilityAwarePollInterval(15000, 60000),
    refetchOnWindowFocus: true,
  });
}

export function useAnswerQuiz() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ stickerId, selectedIndex }: { stickerId: string; selectedIndex: number }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("story_quiz_answers")
        .insert({ sticker_id: stickerId, selected_index: selectedIndex, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quiz-results", vars.stickerId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Q&A Responses ──────────────────────────────────────────────────────

export function useQuestionResponses(stickerId: string) {
  return useQuery({
    queryKey: ["question-responses", stickerId],
    enabled: !!stickerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_question_responses")
        .select("id, response_text, created_at, profiles(username, avatar_url)")
        .eq("sticker_id", stickerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        sticker_id: stickerId,
        response_text: r.response_text,
        user: {
          username: r.profiles?.username ?? "Anonymous",
          avatar_url: r.profiles?.avatar_url ?? null,
        },
      })) as QuestionResponse[];
    },
    refetchInterval: () => getVisibilityAwarePollInterval(15000, 60000),
    refetchOnWindowFocus: true,
  });
}

export function useRespondToQuestion() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ stickerId, responseText }: { stickerId: string; responseText: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("story_question_responses")
        .insert({ sticker_id: stickerId, response_text: responseText, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["question-responses", vars.stickerId] });
      toast.success("Response sent!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Emoji Slider ───────────────────────────────────────────────────────

export function useEmojiSliderAverage(stickerId: string) {
  return useQuery({
    queryKey: ["emoji-slider", stickerId],
    enabled: !!stickerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_emoji_slider_votes")
        .select("value")
        .eq("sticker_id", stickerId);

      if (error) throw error;

      const values = (data ?? []).map((v: { value: number }) => v.value);
      const total = values.length;
      const avg = total > 0 ? values.reduce((sum: number, v: number) => sum + v, 0) / total : 0;

      return { average: avg, total };
    },
    refetchInterval: () => getVisibilityAwarePollInterval(15000, 60000),
    refetchOnWindowFocus: true,
  });
}

export function useVoteEmojiSlider() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ stickerId, value }: { stickerId: string; value: number }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("story_emoji_slider_votes")
        .insert({ sticker_id: stickerId, value, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["emoji-slider", vars.stickerId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Create stickers on a story ─────────────────────────────────────────

export function useAddStorySticker() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sticker: {
      story_id: string;
      sticker_type: StickerType;
      position_x: number;
      position_y: number;
      rotation?: number;
      scale?: number;
      data: Record<string, any>;
    }) => {
      const { error } = await supabase.from("story_stickers").insert({
        story_id: sticker.story_id,
        sticker_type: sticker.sticker_type,
        position_x: sticker.position_x,
        position_y: sticker.position_y,
        rotation: sticker.rotation ?? 0,
        scale: sticker.scale ?? 1,
        payload: sticker.data,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["story-stickers", vars.story_id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
