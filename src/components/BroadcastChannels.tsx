import { useState } from "react";
import { Radio, Users, Lock, Globe, Plus, ChevronRight, Bell, BellOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  is_public: boolean;
  subscriber_count: number;
  created_at: string;
  creator_profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
  is_subscribed?: boolean;
}

export function useBroadcastChannels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["broadcast-channels", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("broadcast_channels")
        .select("*, creator_profile:profiles!broadcast_channels_creator_id_fkey(username, display_name, avatar_url, is_verified)")
        .order("subscriber_count", { ascending: false })
        .limit(50);
      if (error) throw error;

      // Check subscriptions
      if (user && data?.length) {
        const { data: subs } = await (supabase as any)
          .from("broadcast_subscriptions")
          .select("channel_id")
          .eq("user_id", user.id);
        const subIds = new Set((subs || []).map((s: any) => s.channel_id));
        return (data as Channel[]).map((ch) => ({ ...ch, is_subscribed: subIds.has(ch.id) }));
      }
      return (data || []) as Channel[];
    },
  });
}

export function useCreateBroadcastChannel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("broadcast_channels").insert({
        name,
        description: description || null,
        creator_id: user.id,
        is_public: isPublic,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcast-channels"] });
      toast.success("Channel created!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleChannelSubscription() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ channelId, subscribed }: { channelId: string; subscribed: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (subscribed) {
        await (supabase as any).from("broadcast_subscriptions").delete().eq("channel_id", channelId).eq("user_id", user.id);
      } else {
        await (supabase as any).from("broadcast_subscriptions").insert({ channel_id: channelId, user_id: user.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcast-channels"] });
    },
  });
}

const BroadcastChannels = () => {
  const { user } = useAuth();
  const { data: channels = [], isLoading } = useBroadcastChannels();
  const createChannel = useCreateBroadcastChannel();
  const toggleSub = useToggleChannelSubscription();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createChannel.mutateAsync({ name: name.trim(), description: desc.trim(), isPublic });
    setShowCreate(false);
    setName("");
    setDesc("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Broadcast Channels</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mx-4 space-y-2 rounded-xl border border-border bg-card p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Channel name"
            maxLength={40}
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            maxLength={100}
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsPublic(!isPublic)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {isPublic ? "Public" : "Private"}
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={!name.trim() || createChannel.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Channel list */}
      {(channels as Channel[]).length > 0 ? (
        <div className="divide-y divide-border/60">
          {(channels as Channel[]).map((channel) => {
            const creator = channel.creator_profile;
            const isMine = channel.creator_id === user?.id;
            return (
              <div key={channel.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">{channel.name}</p>
                    {!channel.is_public && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{creator?.display_name || "Unknown"}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Users className="h-3 w-3" />
                      {channel.subscriber_count}
                    </span>
                  </div>
                </div>
                {!isMine && (
                  <button
                    onClick={() => toggleSub.mutate({ channelId: channel.id, subscribed: !!channel.is_subscribed })}
                    className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      channel.is_subscribed
                        ? "bg-secondary text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {channel.is_subscribed ? (
                      <>
                        <BellOff className="h-3 w-3" />
                        Joined
                      </>
                    ) : (
                      <>
                        <Bell className="h-3 w-3" />
                        Join
                      </>
                    )}
                  </button>
                )}
                {isMine && (
                  <span className="text-[11px] font-semibold text-primary">Owner</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            <Radio className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">No channels yet</p>
          <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
            Create a broadcast channel to share updates with your followers
          </p>
        </div>
      )}
    </div>
  );
};

export default BroadcastChannels;
