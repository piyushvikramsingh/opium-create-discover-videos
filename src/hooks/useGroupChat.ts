import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  joined_at: string;
}

export interface GroupConversation {
  id: string;
  name: string;
  avatar_url: string | null;
  is_group: boolean;
  vanish_mode: boolean;
  member_count: number;
  members: GroupMember[];
}

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * Create a new group conversation.
 */
export function useCreateGroupChat() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      name,
      memberIds,
    }: {
      name: string;
      memberIds: string[];
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("create_group_chat", {
        p_name: name,
        p_member_ids: memberIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Group created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Fetch group members for a conversation.
 */
export function useGroupMembers(conversationId: string) {
  return useQuery({
    queryKey: ["group-members", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select(
          `
          user_id,
          profiles!inner(username, display_name, avatar_url)
        `
        )
        .eq("conversation_id", conversationId);

      if (error) throw error;

      const { data: admins } = await supabase
        .from("group_admins")
        .select("user_id")
        .eq("conversation_id", conversationId);

      const adminIds = new Set((admins ?? []).map((a: { user_id: string }) => a.user_id));

      return (data ?? []).map((m: any) => ({
        user_id: m.user_id,
        username: m.profiles.username,
        display_name: m.profiles.display_name,
        avatar_url: m.profiles.avatar_url,
        is_admin: adminIds.has(m.user_id),
        joined_at: m.joined_at ?? "",
      })) as GroupMember[];
    },
  });
}

/**
 * Add a member to a group conversation.
 */
export function useAddGroupMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conversationId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["group-members", vars.conversationId] });
      toast.success("Member added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Remove a member from a group conversation.
 */
export function useRemoveGroupMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["group-members", vars.conversationId] });
      toast.success("Member removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Toggle vanish mode for a conversation.
 */
export function useToggleVanishMode() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      enabled,
    }: {
      conversationId: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ vanish_mode: enabled })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(vars.enabled ? "Vanish mode on 👻" : "Vanish mode off");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Track screenshot event in a conversation.
 */
export function useReportScreenshot() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
    }: {
      conversationId: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("screenshot_events")
        .insert({
          user_id: user.id,
          target_type: "message",
          target_id: conversationId,
          conversation_id: conversationId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast("📸 Screenshot taken");
    },
  });
}

/**
 * Promote / demote a group admin.
 */
export function useToggleGroupAdmin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
      isAdmin,
    }: {
      conversationId: string;
      userId: string;
      isAdmin: boolean;
    }) => {
      if (isAdmin) {
        const { error } = await supabase
          .from("group_admins")
          .insert({ conversation_id: conversationId, user_id: userId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("group_admins")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["group-members", vars.conversationId] });
      toast.success(vars.isAdmin ? "Made admin" : "Removed admin");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
