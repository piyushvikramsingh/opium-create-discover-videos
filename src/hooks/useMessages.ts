import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get conversation IDs the user participates in
      const { data: parts, error: pErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user!.id);
      if (pErr) throw pErr;
      if (!parts || parts.length === 0) return [];

      const ids = parts.map((p: any) => p.conversation_id);

      // Get conversations
      const { data: convos, error: cErr } = await supabase
        .from("conversations")
        .select("*")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      if (cErr) throw cErr;

      // Get all participants with profiles for these conversations
      const { data: allParts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", ids);

      const otherUserIds = [...new Set(
        (allParts || [])
          .filter((p: any) => p.user_id !== user!.id)
          .map((p: any) => p.user_id)
      )];

      let profileMap: Record<string, any> = {};
      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", otherUserIds);
        (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      // Get last message for each conversation
      const enriched = await Promise.all(
        (convos || []).map(async (c: any) => {
          const { data: msgs } = await supabase
            .from("messages")
            .select("content, created_at, sender_id, media_type, is_snap")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);

          const otherParticipants = (allParts || [])
            .filter((p: any) => p.conversation_id === c.id && p.user_id !== user!.id)
            .map((p: any) => profileMap[p.user_id])
            .filter(Boolean);

          return {
            ...c,
            lastMessage: msgs?.[0] || null,
            otherParticipants,
          };
        })
      );

      return enriched;
    },
  });
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
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
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

  return query;
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
    }: {
      conversationId: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      isSnap?: boolean;
      snapDuration?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        is_snap: isSnap || false,
        snap_duration: snapDuration || null,
      });
      if (error) throw error;

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkSnapViewed() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; conversationId: string }) => {
      const { error } = await supabase
        .from("messages")
        .update({ viewed: true })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
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

      // Check if DM conversation already exists between these two users
      const { data: myConvos } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myConvos && myConvos.length > 0) {
        const myConvoIds = myConvos.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", targetUserId)
          .in("conversation_id", myConvoIds);

        if (shared && shared.length > 0) {
          // Check if it's a DM
          const { data: convo } = await supabase
            .from("conversations")
            .select("*")
            .eq("id", shared[0].conversation_id)
            .eq("type", "dm")
            .maybeSingle();
          if (convo) return convo.id;
        }
      }

      // Create new conversation with client-generated ID to avoid SELECT RLS issue
      const newId = crypto.randomUUID();
      const { error: cErr } = await supabase
        .from("conversations")
        .insert({ id: newId, type: "dm" });
      if (cErr) throw cErr;

      // Add both participants
      const { error: pErr } = await supabase
        .from("conversation_participants")
        .insert([
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
  return useQuery({
    queryKey: ["search-users", query],
    enabled: !!query && query.length >= 2 && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .neq("user_id", user!.id)
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}
