import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { buildOrIlikeClause, normalizeSearchInput } from "@/lib/search";

const isSchemaMismatchError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

const extractMentionUsernames = (text: string) => {
  const matches = text.match(/@[\w.]+/g) || [];
  return Array.from(new Set(matches.map((value) => value.replace("@", "").toLowerCase())));
};

const ensureMentionTargetsAllowMentions = async (mentionUsernames: string[]) => {
  if (mentionUsernames.length === 0) return;

  const { data: mentionProfiles, error: mentionProfilesError } = await supabase
    .from("profiles")
    .select("username, allow_mentions")
    .in("username", mentionUsernames);
  if (mentionProfilesError && !isSchemaMismatchError(mentionProfilesError)) throw mentionProfilesError;

  const disallowed = (mentionProfiles || [])
    .filter((profile: any) => profile.allow_mentions === false)
    .map((profile: any) => `@${profile.username}`);

  if (disallowed.length > 0) {
    throw new Error(`Mentions are restricted for: ${disallowed.join(", ")}`);
  }
};

const ensureCanMessageTarget = async (senderUserId: string, targetUserId: string) => {
  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("user_id, allow_messages_from")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetProfileError && !isSchemaMismatchError(targetProfileError)) throw targetProfileError;

  const messagePolicy = targetProfile?.allow_messages_from || "everyone";
  if (messagePolicy === "none") {
    throw new Error("This user is not accepting new messages");
  }

  if (messagePolicy === "following") {
    const { data: followRow, error: followError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", senderUserId)
      .eq("following_id", targetUserId)
      .maybeSingle();
    if (followError) throw followError;
    if (!followRow) {
      throw new Error("You can message this user only after following");
    }
  }
};

export type ConversationSettings = {
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  accepted_request: boolean;
};

export function useConversations(includeArchived = false) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id, includeArchived],
    enabled: !!user,
    queryFn: async () => {
      let parts: any[] | null = null;
      const participantsAdvanced = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user!.id);
      if (participantsAdvanced.error) {
        if (!isSchemaMismatchError(participantsAdvanced.error)) throw participantsAdvanced.error;

        const participantsFallback = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user!.id);
        if (participantsFallback.error) throw participantsFallback.error;

        parts = (participantsFallback.data || []).map((participant: any) => ({
          ...participant,
          last_read_at: null,
        }));
      } else {
        parts = participantsAdvanced.data || [];
      }

      if (!parts || parts.length === 0) return [];

      const ids = parts.map((participant: any) => participant.conversation_id);
      const myPartMap = new Map((parts || []).map((participant: any) => [participant.conversation_id, participant]));

      const { data: convos, error: cErr } = await supabase
        .from("conversations")
        .select("*")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      if (cErr) throw cErr;

      const { data: allParts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", ids);

      const otherUserIds = [
        ...new Set(
          (allParts || [])
            .filter((participant: any) => participant.user_id !== user!.id)
            .map((participant: any) => participant.user_id),
        ),
      ];

      let profileMap: Record<string, any> = {};
      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", otherUserIds);
        (profiles || []).forEach((profile: any) => {
          profileMap[profile.user_id] = profile;
        });
      }

      const [blocksRes, mutesRes, followingRes] = await Promise.all([
        supabase.from("user_blocks").select("blocked_user_id").eq("user_id", user!.id),
        supabase.from("user_mutes").select("muted_user_id").eq("user_id", user!.id),
        supabase.from("follows").select("following_id").eq("follower_id", user!.id),
      ]);

      const blockedSet = new Set((blocksRes.data || []).map((row: any) => row.blocked_user_id));
      const mutedSet = new Set((mutesRes.data || []).map((row: any) => row.muted_user_id));
      const followingSet = new Set((followingRes.data || []).map((row: any) => row.following_id));

      const settingsAdvanced = await supabase
        .from("conversation_settings")
        .select("conversation_id, pinned, muted, archived, accepted_request")
        .eq("user_id", user!.id)
        .in("conversation_id", ids);

      let settingsRows: any[] = [];
      if (settingsAdvanced.error) {
        if (!isSchemaMismatchError(settingsAdvanced.error)) throw settingsAdvanced.error;

        const settingsFallback = await supabase
          .from("conversation_settings")
          .select("conversation_id, pinned, muted, archived")
          .eq("user_id", user!.id)
          .in("conversation_id", ids);
        if (settingsFallback.error && !isSchemaMismatchError(settingsFallback.error)) throw settingsFallback.error;
        settingsRows = (settingsFallback.data || []).map((row: any) => ({ ...row, accepted_request: false }));
      } else {
        settingsRows = settingsAdvanced.data || [];
      }

      const settingsMap = new Map((settingsRows || []).map((row: any) => [row.conversation_id, row]));

      const allMessagesAdvanced = await supabase
        .from("messages")
        .select("id, conversation_id, content, created_at, sender_id, media_type, is_snap, viewed, deleted_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });

      let allMessages: any[] = allMessagesAdvanced.data || [];
      if (allMessagesAdvanced.error) {
        if (!isSchemaMismatchError(allMessagesAdvanced.error)) throw allMessagesAdvanced.error;

        const allMessagesFallback = await supabase
          .from("messages")
          .select("id, conversation_id, content, created_at, sender_id, media_type, is_snap, viewed")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false });

        if (allMessagesFallback.error) throw allMessagesFallback.error;
        allMessages = (allMessagesFallback.data || []).map((message: any) => ({ ...message, deleted_at: null }));
      }

      const lastMessageByConversation = new Map<string, any>();
      const unreadCountByConversation = new Map<string, number>();
      const hasMyMessageByConversation = new Map<string, boolean>();

      for (const message of allMessages) {
        const conversationId = message.conversation_id;
        if (!lastMessageByConversation.has(conversationId)) {
          lastMessageByConversation.set(conversationId, message);
        }

        if (message.sender_id === user!.id) {
          hasMyMessageByConversation.set(conversationId, true);
        }

        if (message.sender_id === user!.id) continue;
        const myLastReadAt = myPartMap.get(conversationId)?.last_read_at;
        if (!myLastReadAt || new Date(message.created_at).getTime() > new Date(myLastReadAt).getTime()) {
          unreadCountByConversation.set(conversationId, (unreadCountByConversation.get(conversationId) || 0) + 1);
        }
      }

      const enriched = (convos || []).map((conversation: any) => {
        const myPart = myPartMap.get(conversation.id);
        const myLastReadAt = myPart?.last_read_at;

        const otherParticipants = (allParts || [])
          .filter((participant: any) => participant.conversation_id === conversation.id && participant.user_id !== user!.id)
          .map((participant: any) => {
            const profile = profileMap[participant.user_id];
            if (profile) return profile;

            const shortId = String(participant.user_id).slice(0, 8);
            return {
              user_id: participant.user_id,
              username: `user_${shortId}`,
              display_name: `User ${shortId}`,
              avatar_url: null,
            };
          });

        const settings = settingsMap.get(conversation.id) || { pinned: false, muted: false, archived: false, accepted_request: false };
        const unreadCount = unreadCountByConversation.get(conversation.id) || 0;
        const lastMessage = lastMessageByConversation.get(conversation.id) || null;
        const firstOther = otherParticipants[0];
        const hasMyMessage = hasMyMessageByConversation.get(conversation.id) || false;
        const isMessageRequest =
          !!firstOther &&
          otherParticipants.length === 1 &&
          !followingSet.has(firstOther.user_id) &&
          !settings.accepted_request &&
          !hasMyMessage &&
          !!lastMessage &&
          lastMessage.sender_id === firstOther.user_id;

        return {
          ...conversation,
          lastMessage,
          otherParticipants,
          unreadCount,
          isUnread: unreadCount > 0,
          myLastReadAt: myLastReadAt || null,
          settings,
          isMessageRequest,
          isBlockedOrMuted: otherParticipants.some(
            (participant: any) => blockedSet.has(participant.user_id) || mutedSet.has(participant.user_id),
          ),
        };
      });

      const filteredBySafety = enriched.filter((conversation: any) => !conversation.isBlockedOrMuted);

      const filtered = includeArchived
        ? filteredBySafety
        : filteredBySafety.filter((conversation: any) => !conversation.settings.archived);

      return filtered.sort((a: any, b: any) => {
        if (a.settings.pinned && !b.settings.pinned) return -1;
        if (!a.settings.pinned && b.settings.pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    },
  });
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      let messages: any[] | null = null;
      const advancedQuery = await supabase
        .from("messages")
        .select("*, reply:reply_to_message_id(id, sender_id, content, media_type, is_snap, deleted_at)")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (advancedQuery.error) {
        if (!isSchemaMismatchError(advancedQuery.error)) throw advancedQuery.error;

        const fallbackQuery = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId!)
          .order("created_at", { ascending: true });
        if (fallbackQuery.error) throw fallbackQuery.error;

        messages = (fallbackQuery.data || []).map((message: any) => ({
          ...message,
          reply: null,
        }));
      } else {
        messages = advancedQuery.data || [];
      }

      const messageIds = (messages || []).map((message: any) => message.id);
      if (messageIds.length === 0) return [];

      const { data: reactions, error: reactionsError } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", messageIds);

      if (reactionsError && !isSchemaMismatchError(reactionsError)) {
        throw reactionsError;
      }

      const reactionMap = new Map<string, any[]>();
      (reactions || []).forEach((reaction: any) => {
        const list = reactionMap.get(reaction.message_id) || [];
        list.push(reaction);
        reactionMap.set(reaction.message_id, list);
      });

      return (messages || []).map((message: any) => {
        const messageReactions = reactionMap.get(message.id) || [];
        return {
          ...message,
          reactions: messageReactions,
        };
      });
    },
  });

  useEffect(() => {
    if (!conversationId) return;

    const messagesChannel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();

    const reactionsChannel = supabase
      .channel(`message-reactions-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(reactionsChannel);
    };
  }, [conversationId, qc]);

  return query;
}

export function useTypingStatus(conversationId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["typing-status", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("typing_status")
        .select("conversation_id, user_id, is_typing, updated_at")
        .eq("conversation_id", conversationId!)
        .eq("is_typing", true);
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return (data || []).filter((row: any) => row.user_id !== user?.id);
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`typing-status-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_status",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["typing-status", conversationId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  return query;
}

export function useSetTypingStatus() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("typing_status").upsert(
        {
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useTypingConversations(conversationIds: string[]) {
  const { user } = useAuth();

  const stableIds = [...conversationIds].sort();

  return useQuery({
    queryKey: ["typing-conversations", user?.id, stableIds],
    enabled: !!user && stableIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("typing_status")
        .select("conversation_id, user_id, is_typing, updated_at")
        .in("conversation_id", stableIds)
        .eq("is_typing", true);

      if (error) {
        if (isSchemaMismatchError(error)) return {} as Record<string, number>;
        throw error;
      }

      const cutoff = Date.now() - 20_000;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.user_id === user?.id) return;
        const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        if (updatedAt < cutoff) return;
        counts[row.conversation_id] = (counts[row.conversation_id] || 0) + 1;
      });

      return counts;
    },
    refetchInterval: 5000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      mediaUrl,
      mediaType,
      isSnap,
      snapDuration,
      replyToMessageId,
    }: {
      conversationId: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      isSnap?: boolean;
      snapDuration?: number;
      replyToMessageId?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const participantsQuery = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);
      if (participantsQuery.error && !isSchemaMismatchError(participantsQuery.error)) throw participantsQuery.error;

      const participants = participantsQuery.data || [];
      const otherParticipants = participants.filter((participant: any) => participant.user_id !== user.id);
      if (otherParticipants.length === 1) {
        await ensureCanMessageTarget(user.id, otherParticipants[0].user_id);
      }

      const mentionUsernames = extractMentionUsernames(content || "");
      await ensureMentionTargetsAllowMentions(mentionUsernames);

      const advancedInsert = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        is_snap: isSnap || false,
        snap_duration: snapDuration || null,
        status: "sent",
        reply_to_message_id: replyToMessageId || null,
      });
      if (advancedInsert.error) {
        if (!isSchemaMismatchError(advancedInsert.error)) throw advancedInsert.error;

        const fallbackInsert = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content || null,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          is_snap: isSnap || false,
          snap_duration: snapDuration || null,
        });
        if (fallbackInsert.error) throw fallbackInsert.error;
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["typing-status", vars.conversationId] });
    },
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, messageId, content }: { conversationId: string; messageId: string; content: string }) => {
      if (!user) throw new Error("Not authenticated");

      const advancedEdit = await supabase
        .from("messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", messageId)
        .eq("sender_id", user.id);
      if (advancedEdit.error) {
        if (!isSchemaMismatchError(advancedEdit.error)) throw advancedEdit.error;

        const fallbackEdit = await supabase
          .from("messages")
          .update({ content })
          .eq("id", messageId)
          .eq("sender_id", user.id);
        if (fallbackEdit.error) throw fallbackEdit.error;
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (!user) throw new Error("Not authenticated");

      const advancedDelete = await supabase
        .from("messages")
        .update({
          content: null,
          media_url: null,
          media_type: null,
          is_snap: false,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", messageId)
        .eq("sender_id", user.id);
      if (advancedDelete.error) {
        if (!isSchemaMismatchError(advancedDelete.error)) throw advancedDelete.error;

        const fallbackDelete = await supabase
          .from("messages")
          .update({
            content: null,
            media_url: null,
            media_type: null,
            is_snap: false,
          })
          .eq("id", messageId)
          .eq("sender_id", user.id);
        if (fallbackDelete.error) throw fallbackDelete.error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
      emoji,
      existingReaction,
    }: {
      conversationId: string;
      messageId: string;
      emoji: string;
      existingReaction?: { id: string; emoji: string } | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      if (existingReaction && existingReaction.emoji === emoji) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existingReaction.id)
          .eq("user_id", user.id);
        if (error && !isSchemaMismatchError(error)) throw error;
        return;
      }

      const { error } = await supabase.from("message_reactions").upsert(
        {
          message_id: messageId,
          user_id: user.id,
          emoji,
        },
        { onConflict: "message_id,user_id" },
      );
      if (error) {
        if (isSchemaMismatchError(error)) return;
        throw error;
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkSnapViewed() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; conversationId: string }) => {
      const advancedUpdate = await supabase
        .from("messages")
        .update({ viewed: true, status: "seen" })
        .eq("id", messageId);
      if (advancedUpdate.error) {
        if (!isSchemaMismatchError(advancedUpdate.error)) throw advancedUpdate.error;

        const fallbackUpdate = await supabase
          .from("messages")
          .update({ viewed: true })
          .eq("id", messageId);
        if (fallbackUpdate.error) throw fallbackUpdate.error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("conversation_participants")
        .update({ last_read_at: now })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);

      if (error) throw error;

      const { error: seenErr } = await supabase
        .from("messages")
        .update({ status: "seen", viewed: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .eq("is_snap", false)
        .in("status", ["sent", "delivered"]);

      if (seenErr && !isSchemaMismatchError(seenErr)) throw seenErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkConversationDelivered() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("messages")
        .update({ status: "delivered" })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .eq("is_snap", false)
        .eq("status", "sent");

      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversationSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      updates,
    }: {
      conversationId: string;
      updates: Partial<ConversationSettings>;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("conversation_settings").upsert(
        {
          conversation_id: conversationId,
          user_id: user.id,
          pinned: updates.pinned ?? false,
          muted: updates.muted ?? false,
          archived: updates.archived ?? false,
          accepted_request: updates.accepted_request ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error("Not authenticated");

      await ensureCanMessageTarget(user.id, targetUserId);

      const { data: myConvos } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myConvos && myConvos.length > 0) {
        const myConvoIds = myConvos.map((conversation: any) => conversation.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", targetUserId)
          .in("conversation_id", myConvoIds);

        if (shared && shared.length > 0) {
          const convoWithType = await supabase
            .from("conversations")
            .select("*")
            .eq("id", shared[0].conversation_id)
            .eq("type", "dm")
            .maybeSingle();

          if (!convoWithType.error && convoWithType.data) return convoWithType.data.id;

          if (convoWithType.error && isSchemaMismatchError(convoWithType.error)) {
            const convoFallback = await supabase
              .from("conversations")
              .select("*")
              .eq("id", shared[0].conversation_id)
              .maybeSingle();
            if (convoFallback.error) throw convoFallback.error;
            if (convoFallback.data) return convoFallback.data.id;
          }

          if (convoWithType.error && !isSchemaMismatchError(convoWithType.error)) throw convoWithType.error;
        }
      }

      const newId = crypto.randomUUID();
      const createWithType = await supabase.from("conversations").insert({ id: newId, type: "dm" });
      if (createWithType.error) {
        if (!isSchemaMismatchError(createWithType.error)) throw createWithType.error;

        const createFallback = await supabase.from("conversations").insert({ id: newId });
        if (createFallback.error) throw createFallback.error;
      }

      const { error: pErr } = await supabase.from("conversation_participants").insert([
        { conversation_id: newId, user_id: user.id },
        { conversation_id: newId, user_id: targetUserId },
      ]);
      if (pErr) throw pErr;

      return newId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSearchUsers(query: string) {
  const { user } = useAuth();
  const normalizedQuery = normalizeSearchInput(query);

  return useQuery({
    queryKey: ["search-users", normalizedQuery],
    enabled: !!normalizedQuery && normalizedQuery.length >= 2 && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .neq("user_id", user!.id)
        .or(buildOrIlikeClause(["username", "display_name"], normalizedQuery))
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}
