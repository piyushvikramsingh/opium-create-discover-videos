import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

export interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  community_type: "creator_circle" | "fan_club" | "event_group" | "general";
  is_paid: boolean;
  membership_price_cents: number;
  member_count: number;
  is_public: boolean;
  created_by: string;
  created_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  my_role?: string;
}

export interface CommunityMember {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  joined_at: string;
  is_paid: boolean;
}

export interface ChatStreak {
  conversation_id: string;
  streak_count: number;
  longest_streak: number;
  last_interaction_at: string;
  other_user_id: string;
}

export interface PinnedMessage {
  id: string;
  message_id: string;
  pinned_by: string;
  created_at: string;
  message_content?: string | null;
  message_sender_id?: string;
}

export interface DisappearingMode {
  conversation_id: string;
  enabled: boolean;
  duration_hours: number;
  enabled_by: string;
  enabled_at: string;
}

export interface CreatorAutoReply {
  user_id: string;
  enabled: boolean;
  message: string;
  delay_seconds: number;
  active_hours_start: string | null;
  active_hours_end: string | null;
}

// ── Community Groups ───────────────────────────────────────────────────

/**
 * Fetch all community groups the current user is a member of.
 */
export function useCommunityGroups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["community-groups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      // Get communities via conversation_participants
      const { data: participantData, error: pError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (pError) throw pError;
      const convoIds = (participantData ?? []).map((p: { conversation_id: string }) => p.conversation_id);
      if (!convoIds.length) return [];

      const { data: communities, error: cError } = await supabase
        .from("conversations")
        .select("*")
        .in("id", convoIds)
        .eq("is_community", true)
        .order("updated_at", { ascending: false });

      if (cError) throw cError;

      // Get last message for each community
      const results: CommunityGroup[] = [];
      for (const community of communities ?? []) {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", community.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get user's role
        const { data: membership } = await supabase
          .from("community_members")
          .select("role")
          .eq("conversation_id", community.id)
          .eq("user_id", user.id)
          .maybeSingle();

        results.push({
          id: community.id,
          name: community.name || "Unnamed Group",
          description: community.description,
          avatar_url: community.avatar_url,
          community_type: (community.community_type || "general") as CommunityGroup["community_type"],
          is_paid: community.is_paid ?? false,
          membership_price_cents: community.membership_price_cents ?? 0,
          member_count: community.member_count ?? 0,
          is_public: community.is_public ?? false,
          created_by: community.created_by,
          created_at: community.created_at,
          last_message_preview: lastMsg?.content || null,
          last_message_at: lastMsg?.created_at || null,
          my_role: membership?.role || "member",
        });
      }

      return results;
    },
    refetchInterval: 30000,
  });
}

/**
 * Fetch public/discoverable community groups.
 */
export function useDiscoverCommunities(searchQuery: string) {
  return useQuery({
    queryKey: ["discover-communities", searchQuery],
    enabled: searchQuery.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("is_community", true)
        .eq("is_public", true)
        .ilike("name", `%${searchQuery}%`)
        .order("member_count", { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name || "Unnamed Group",
        description: c.description,
        avatar_url: c.avatar_url,
        community_type: c.community_type || "general",
        is_paid: c.is_paid ?? false,
        membership_price_cents: c.membership_price_cents ?? 0,
        member_count: c.member_count ?? 0,
        is_public: c.is_public ?? false,
        created_by: c.created_by,
        created_at: c.created_at,
      })) as CommunityGroup[];
    },
  });
}

/**
 * Create a new community group.
 */
export function useCreateCommunityGroup() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      communityType,
      isPaid,
      membershipPriceCents,
      isPublic,
    }: {
      name: string;
      description?: string;
      communityType: "creator_circle" | "fan_club" | "event_group" | "general";
      isPaid?: boolean;
      membershipPriceCents?: number;
      isPublic?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Create the conversation as a community
      const { data: convo, error: convoError } = await supabase
        .from("conversations")
        .insert({
          type: "group",
          name,
          description,
          is_community: true,
          community_type: communityType,
          is_paid: isPaid || false,
          membership_price_cents: membershipPriceCents || 0,
          is_public: isPublic || false,
          created_by: user.id,
          member_count: 1,
        })
        .select()
        .single();

      if (convoError) throw convoError;

      // Add creator as participant
      await supabase.from("conversation_participants").insert({
        conversation_id: convo.id,
        user_id: user.id,
      });

      // Add creator as community owner
      await supabase.from("community_members").insert({
        conversation_id: convo.id,
        user_id: user.id,
        role: "owner",
      });

      return convo.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-groups"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Community created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Join a community group.
 */
export function useJoinCommunity() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Add as participant
      await supabase.from("conversation_participants").insert({
        conversation_id: conversationId,
        user_id: user.id,
      });

      // Add as member
      await supabase.from("community_members").insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "member",
      });

      // Increment member count
      const { data: convo } = await supabase
        .from("conversations")
        .select("member_count")
        .eq("id", conversationId)
        .single();

      await supabase
        .from("conversations")
        .update({ member_count: (convo?.member_count || 0) + 1 })
        .eq("id", conversationId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-groups"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Joined community!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Leave a community group.
 */
export function useLeaveCommunity() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!user) throw new Error("Not authenticated");

      await supabase
        .from("community_members")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);

      await supabase
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);

      // Decrement member count
      const { data: convo } = await supabase
        .from("conversations")
        .select("member_count")
        .eq("id", conversationId)
        .single();

      await supabase
        .from("conversations")
        .update({ member_count: Math.max(0, (convo?.member_count || 1) - 1) })
        .eq("id", conversationId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-groups"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Left community");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Chat Streaks ───────────────────────────────────────────────────────

/**
 * Fetch streak data for all conversations.
 */
export function useChatStreaks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["chat-streaks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("chat_streaks")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .gt("streak_count", 0);

      if (error) throw error;

      return (data ?? []).map((s: any) => ({
        conversation_id: s.conversation_id,
        streak_count: s.streak_count,
        longest_streak: s.longest_streak,
        last_interaction_at: s.last_interaction_at,
        other_user_id: s.user_a === user.id ? s.user_b : s.user_a,
      })) as ChatStreak[];
    },
    refetchInterval: 60000,
  });
}

/**
 * Get streak for a specific conversation.
 */
export function useChatStreak(conversationId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["chat-streak", conversationId, user?.id],
    enabled: !!user && !!conversationId,
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("chat_streaks")
        .select("*")
        .eq("conversation_id", conversationId)
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        conversation_id: data.conversation_id,
        streak_count: data.streak_count,
        longest_streak: data.longest_streak,
        last_interaction_at: data.last_interaction_at,
        other_user_id: data.user_a === user.id ? data.user_b : data.user_a,
      } as ChatStreak;
    },
  });
}

// ── Pinned Messages ────────────────────────────────────────────────────

/**
 * Fetch pinned messages for a conversation.
 */
export function usePinnedMessages(conversationId: string) {
  return useQuery({
    queryKey: ["pinned-messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinned_messages")
        .select(`
          id,
          message_id,
          pinned_by,
          created_at,
          messages!inner(content, sender_id)
        `)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((p: any) => ({
        id: p.id,
        message_id: p.message_id,
        pinned_by: p.pinned_by,
        created_at: p.created_at,
        message_content: p.messages?.content,
        message_sender_id: p.messages?.sender_id,
      })) as PinnedMessage[];
    },
  });
}

/**
 * Pin a message in a conversation.
 */
export function usePinMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("pinned_messages").insert({
        conversation_id: conversationId,
        message_id: messageId,
        pinned_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pinned-messages", vars.conversationId] });
      toast.success("Message pinned");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Unpin a message.
 */
export function useUnpinMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => {
      const { error } = await supabase
        .from("pinned_messages")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("message_id", messageId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pinned-messages", vars.conversationId] });
      toast.success("Message unpinned");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Disappearing Mode ──────────────────────────────────────────────────

/**
 * Get disappearing mode status for a conversation.
 */
export function useDisappearingMode(conversationId: string) {
  return useQuery({
    queryKey: ["disappearing-mode", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disappearing_mode")
        .select("*")
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        conversation_id: data.conversation_id,
        enabled: data.enabled,
        duration_hours: data.duration_hours,
        enabled_by: data.enabled_by,
        enabled_at: data.enabled_at,
      } as DisappearingMode;
    },
  });
}

/**
 * Toggle disappearing mode for a conversation.
 */
export function useToggleDisappearingMode() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      enabled,
      durationHours,
    }: {
      conversationId: string;
      enabled: boolean;
      durationHours?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("disappearing_mode")
        .upsert({
          conversation_id: conversationId,
          enabled,
          duration_hours: durationHours || 24,
          enabled_by: user.id,
          enabled_at: new Date().toISOString(),
        }, { onConflict: "conversation_id" });

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["disappearing-mode", vars.conversationId] });
      toast.success(vars.enabled ? "Disappearing messages on (24h)" : "Disappearing messages off");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Creator Auto-Reply ─────────────────────────────────────────────────

/**
 * Get creator auto-reply settings.
 */
export function useCreatorAutoReply(userId?: string) {
  return useQuery({
    queryKey: ["creator-auto-reply", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_auto_reply")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();

      if (error) throw error;
      return data as CreatorAutoReply | null;
    },
  });
}

/**
 * Update creator auto-reply settings.
 */
export function useUpdateCreatorAutoReply() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: {
      enabled: boolean;
      message?: string;
      delay_seconds?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("creator_auto_reply")
        .upsert({
          user_id: user.id,
          enabled: settings.enabled,
          message: settings.message || "Thanks for reaching out! I'll get back to you soon.",
          delay_seconds: settings.delay_seconds || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator-auto-reply"] });
      toast.success("Auto-reply settings updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── AI Smart Reply Suggestions ─────────────────────────────────────────

const SMART_REPLY_TEMPLATES: Record<string, string[]> = {
  greeting: ["Hey! 👋", "What's up!", "Hi there! 😊"],
  question: ["For sure!", "Let me check", "I'm not sure, let me think"],
  compliment: ["Thank you! 🙏", "That means a lot!", "You're too kind 😊"],
  agreement: ["Totally!", "100% agree", "Same here!"],
  excitement: ["That's amazing! 🔥", "No way!! 😱", "Let's gooo!"],
  sad: ["I'm sorry to hear that 💙", "Sending hugs", "I'm here for you"],
  funny: ["😂😂", "I'm dead 💀", "Lmaooo"],
  farewell: ["Talk soon!", "Later! ✌️", "Goodnight! 🌙"],
  general: ["Sounds good!", "Got it 👍", "Cool!"],
};

/**
 * Generate smart reply suggestions based on the last message content.
 */
export function useSmartReplySuggestions(lastMessageContent: string | null | undefined) {
  const content = (lastMessageContent || "").toLowerCase().trim();

  if (!content) return [];

  // Simple keyword matching for suggestions
  if (/\b(hi|hey|hello|sup|what'?s up|yo)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.greeting;
  }
  if (/\?/.test(content)) {
    return SMART_REPLY_TEMPLATES.question;
  }
  if (/\b(love|amazing|great|awesome|beautiful|fire|sick|insane)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.compliment;
  }
  if (/\b(right|agree|same|exactly|true)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.agreement;
  }
  if (/\b(omg|wow|no way|crazy|insane|exciting)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.excitement;
  }
  if (/\b(sad|sorry|bad|unfortunately|miss|hurt)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.sad;
  }
  if (/\b(lol|lmao|haha|😂|🤣|funny|hilarious)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.funny;
  }
  if (/\b(bye|goodnight|gn|later|see you|talk soon|ttyl)\b/i.test(content)) {
    return SMART_REPLY_TEMPLATES.farewell;
  }

  return SMART_REPLY_TEMPLATES.general;
}
