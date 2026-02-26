import { Component, type ErrorInfo, type MouseEvent, type ReactNode, type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, Plus, X, Flame, Circle, MoreHorizontal, Pin, PinOff, Bell, BellOff, Archive, Loader2, CheckCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useConversations,
  useCreateConversation,
  useSearchUsers,
  useTypingConversations,
  useUpdateConversationSettings,
} from "@/hooks/useMessages";
import {
  useInboxNotes,
  useIncomingFollowRequests,
  useDeleteNotification,
  useLogMessageRequestAction,
  useMarkAllNotificationsRead,
  useMarkMessageRequestNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useRespondFollowRequest,
  useUpsertInboxNote,
} from "@/hooks/useData";
import { useLocation, useNavigate } from "react-router-dom";
import ChatView from "../components/ChatView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type InboxUser = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type InboxMessage = {
  created_at?: string;
  is_snap?: boolean;
  viewed?: boolean;
  media_type?: string | null;
  content?: string | null;
};

type InboxConversation = {
  id: string;
  unreadCount?: number;
  isMessageRequest?: boolean;
  lastMessage?: InboxMessage | null;
  otherParticipants?: InboxUser[];
  settings?: {
    pinned?: boolean;
    muted?: boolean;
    archived?: boolean;
    accepted_request?: boolean;
  };
};

type InboxNotification = {
  id: string;
  title: string;
  body?: string | null;
  is_read?: boolean;
  created_at?: string;
  type?: string;
  entity_id?: string | null;
  actor_id?: string | null;
};

type IncomingFollowRequest = {
  id: string;
  follower_id: string;
  profile?: InboxUser | null;
};

type ChatErrorBoundaryProps = {
  children: ReactNode;
  onBack: () => void;
};

type ChatErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  state: ChatErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, message: error.message || "Chat failed to load" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChatView runtime error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
          <p className="text-sm font-semibold text-foreground">Couldn’t open this chat</p>
          <p className="mt-2 max-w-sm text-xs text-muted-foreground">{this.state.message}</p>
          <button
            type="button"
            onClick={this.props.onBack}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Back to Inbox
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const Inbox = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<"all" | "unread" | "requests" | "archived">("all");
  const { data: conversations, isLoading } = useConversations(filter === "archived");
  const createConversation = useCreateConversation();
  const updateConversationSettings = useUpdateConversationSettings();
  const { data: inboxNotes = [] } = useInboxNotes(30);
  const upsertInboxNote = useUpsertInboxNote();
  const { data: notifications = [] } = useNotifications(10);
  const { data: incomingFollowRequests = [] } = useIncomingFollowRequests();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const markMessageRequestNotificationsRead = useMarkMessageRequestNotificationsRead();
  const markNotificationRead = useMarkNotificationRead();
  const logMessageRequestAction = useLogMessageRequestAction();
  const deleteNotification = useDeleteNotification();
  const respondFollowRequest = useRespondFollowRequest();
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [bulkRequestAction, setBulkRequestAction] = useState<null | "accept" | "delete">(null);
  const [swipedConversationId, setSwipedConversationId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    otherUser: InboxUser;
  } | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const { data: searchResults } = useSearchUsers(newChatQuery);
  const conversationIds = useMemo(
    () => ((conversations ?? []) as InboxConversation[]).map((convo) => convo.id),
    [conversations],
  );
  const { data: typingByConversation = {} } = useTypingConversations(conversationIds);

  const handleToggleSetting = async (
    conversationId: string,
    currentSettings: { pinned?: boolean; muted?: boolean; archived?: boolean; accepted_request?: boolean },
    key: "pinned" | "muted" | "archived" | "accepted_request",
  ) => {
    try {
      await updateConversationSettings.mutateAsync({
        conversationId,
        updates: {
          ...currentSettings,
          [key]: !currentSettings[key],
        },
      });
      toast.success("Chat updated");
    } catch {
      toast.error("Failed to update chat");
    }
  };

  const handleStartChat = async (targetUser: InboxUser) => {
    try {
      const conversationId = await createConversation.mutateAsync(targetUser.user_id);
      setActiveConversation({ id: conversationId, otherUser: targetUser });
      setShowNewChat(false);
      setNewChatQuery("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start chat";
      toast.error(message || "Failed to start chat");
      console.error("Failed to start chat:", err);
    }
  };

  const handleFollowRequest = async (request: IncomingFollowRequest, accept: boolean) => {
    try {
      setActingRequestId(request.id);
      await respondFollowRequest.mutateAsync({
        requestId: request.id,
        followerId: request.follower_id,
        accept,
      });
      toast.success(accept ? "Follow request accepted" : "Follow request rejected");
    } catch {
      toast.error("Failed to update follow request");
    } finally {
      setActingRequestId(null);
    }
  };

  const handleNotificationClick = (notification: InboxNotification) => {
    if (!notification.is_read) {
      markNotificationRead.mutate({ notificationId: notification.id });
    }

    const type = notification.type || "";
    if (type === "follow" && notification.actor_id) {
      navigate(`/profile/${notification.actor_id}`);
      return;
    }

    if (["comment", "reply", "like", "save"].includes(type) && notification.entity_id) {
      navigate("/clipy", {
        state: { focusVideoId: notification.entity_id, focusSource: "inbox-notifications" },
      });
      return;
    }

    if (type === "message_request") {
      navigate("/inbox", { state: { focus: "requests" } });
      return;
    }

    if (type === "message" || type === "story_reply") {
      navigate("/inbox", { state: { focus: "messages" } });
      return;
    }

    navigate("/", { state: { focus: "notifications" } });
  };

  const handleNotificationMarkRead = (event: MouseEvent, notification: InboxNotification) => {
    event.stopPropagation();
    if (notification.is_read) return;
    markNotificationRead.mutate({ notificationId: notification.id });
  };

  const handleNotificationDelete = (event: MouseEvent, notification: InboxNotification) => {
    event.stopPropagation();
    deleteNotification.mutate({ notificationId: notification.id });
  };

  const handleConversationTouchStart = (event: TouchEvent, conversationId: string) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
    if (swipedConversationId && swipedConversationId !== conversationId) {
      setSwipedConversationId(null);
    }
  };

  const handleConversationTouchEnd = (event: TouchEvent, conversationId: string) => {
    if (touchStartX === null) return;
    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = touchEndX - touchStartX;

    if (deltaX <= -40) {
      setSwipedConversationId(conversationId);
    } else if (deltaX >= 40 && swipedConversationId === conversationId) {
      setSwipedConversationId(null);
    }

    setTouchStartX(null);
  };

  const getPreview = (lastMsg?: InboxMessage | null) => {
    if (!lastMsg) return "No messages yet";
    if (lastMsg.is_snap) return lastMsg.viewed ? "Opened snap" : "New snap";
    if (lastMsg.media_type === "image") return "📷 Photo";
    if (lastMsg.media_type === "video") return "🎥 Video";
    if (lastMsg.media_type === "audio") return "🎤 Voice note";
    return lastMsg.content || "Message";
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const filteredConversations = useMemo(() => {
    const source = (conversations ?? []) as InboxConversation[];
    const query = inboxQuery.trim().toLowerCase();

    return source.filter((convo) => {
      const other = convo.otherParticipants?.[0];
      if (!other) return false;
      const archived = !!convo.settings?.archived;

      const matchFilter =
        filter === "archived"
          ? archived
          : filter === "requests"
            ? !!convo.isMessageRequest && !archived
          : filter === "unread"
            ? (convo.unreadCount ?? 0) > 0 && !archived && !convo.isMessageRequest
            : !archived && !convo.isMessageRequest;
      if (!matchFilter) return false;

      if (!query) return true;
      const preview = getPreview(convo.lastMessage).toLowerCase();
      return (
        other.display_name?.toLowerCase().includes(query) ||
        other.username?.toLowerCase().includes(query) ||
        preview.includes(query)
      );
    });
  }, [conversations, inboxQuery, filter]);

  const quickContacts = useMemo(() => {
    return ((conversations ?? []) as InboxConversation[])
      .map((convo) => ({
        convoId: convo.id,
        other: convo.otherParticipants?.[0],
        unreadCount: convo.unreadCount ?? 0,
        archived: !!convo.settings?.archived,
        isMessageRequest: !!convo.isMessageRequest,
      }))
      .filter((item) => !!item.other && !item.archived && !item.isMessageRequest)
      .slice(0, 12);
  }, [conversations]);

  const notesByUser = useMemo(() => {
    const map = new Map<string, any>();
    (inboxNotes as any[]).forEach((note) => {
      if (!note?.user_id) return;
      if (map.has(note.user_id)) return;
      map.set(note.user_id, note);
    });
    return Array.from(map.values());
  }, [inboxNotes]);

  const myNote = useMemo(() => {
    return notesByUser.find((note: any) => note.user_id === user?.id) || null;
  }, [notesByUser, user?.id]);

  const handleSaveNote = async () => {
    if (!noteDraft.trim()) return;
    try {
      await upsertInboxNote.mutateAsync({ content: noteDraft });
      setNoteDraft("");
      toast.success("Note updated");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update note";
      toast.error(message || "Failed to update note");
    }
  };

  const unreadTotal = useMemo(() => {
    return ((conversations ?? []) as InboxConversation[]).reduce((acc: number, convo) => acc + (convo.unreadCount ?? 0), 0);
  }, [conversations]);

  const messageRequestConversations = useMemo(() => {
    return ((conversations ?? []) as InboxConversation[]).filter(
      (convo) => !!convo.isMessageRequest && !convo.settings?.archived,
    );
  }, [conversations]);

  const handleBulkRequestAction = async (action: "accept" | "delete") => {
    if (bulkRequestAction) return;
    if (messageRequestConversations.length === 0) return;

    try {
      setBulkRequestAction(action);
      for (const convo of messageRequestConversations) {
        const settings = convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
        await updateConversationSettings.mutateAsync({
          conversationId: convo.id,
          updates:
            action === "accept"
              ? { ...settings, accepted_request: true, archived: false }
              : { ...settings, archived: true },
        });
        await logMessageRequestAction.mutateAsync({
          conversationId: convo.id,
          action,
          surface: "inbox-bulk",
        });
      }
      toast.success(action === "accept" ? "All message requests accepted" : "All message requests deleted");
    } catch {
      toast.error("Failed to update message requests");
    } finally {
      setBulkRequestAction(null);
    }
  };

  const groupedNotifications = useMemo(() => {
    const grouped: Record<"today" | "week" | "older", InboxNotification[]> = {
      today: [],
      week: [],
      older: [],
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

    (notifications as InboxNotification[]).forEach((notification) => {
      const createdAt = notification.created_at ? new Date(notification.created_at).getTime() : NaN;
      if (Number.isNaN(createdAt)) {
        grouped.older.push(notification);
        return;
      }
      if (createdAt >= todayStart) {
        grouped.today.push(notification);
        return;
      }
      if (createdAt >= weekStart) {
        grouped.week.push(notification);
        return;
      }
      grouped.older.push(notification);
    });

    return grouped;
  }, [notifications]);

  const unreadMessageRequestNotifications = useMemo(() => {
    return (notifications as InboxNotification[]).filter(
      (notification) => notification.type === "message_request" && !notification.is_read,
    ).length;
  }, [notifications]);

  useEffect(() => {
    const state = location.state as
      | {
          openConversationId?: string;
          openUser?: {
            user_id: string;
            username: string;
            display_name: string;
            avatar_url: string | null;
          };
        }
      | undefined;

    if (!state?.openConversationId || !state?.openUser) return;

    setActiveConversation({ id: state.openConversationId, otherUser: state.openUser });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const focus = (location.state as { focus?: string } | null)?.focus;
    if (focus === "notifications" && notificationsRef.current) {
      window.setTimeout(() => {
        notificationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else if (focus === "requests") {
      setFilter("requests");
    }
  }, [location.state]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 pb-20">
        <p className="mb-4 text-muted-foreground">Sign in to view messages</p>
        <button
          onClick={() => navigate("/auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (activeConversation) {
    return (
      <div className="h-[100dvh] pb-16">
        <ChatErrorBoundary onBack={() => setActiveConversation(null)}>
          <ChatView
            conversationId={activeConversation.id}
            otherUser={activeConversation.otherUser}
            onBack={() => setActiveConversation(null)}
          />
        </ChatErrorBoundary>
      </div>
    );
  }

  return (
    <div className="fade-in min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Messages</h1>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {unreadTotal}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="lift-on-tap rounded-full bg-primary p-2 text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={inboxQuery}
              onChange={(e) => setInboxQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl bg-secondary py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "unread" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            Unread
          </button>
          <button
            onClick={() => setFilter("requests")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "requests" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            Requests
          </button>
          <button
            onClick={() => setFilter("archived")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "archived" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            Archived
          </button>
        </div>

        {filter === "requests" && messageRequestConversations.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            <button
              onClick={() => handleBulkRequestAction("delete")}
              disabled={bulkRequestAction !== null}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground disabled:opacity-60"
            >
              {bulkRequestAction === "delete" ? "Deleting..." : "Delete all"}
            </button>
            <button
              onClick={() => handleBulkRequestAction("accept")}
              disabled={bulkRequestAction !== null}
              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {bulkRequestAction === "accept" ? "Accepting..." : "Accept all"}
            </button>
          </div>
        )}
      </div>

      {filter === "all" && !!quickContacts.length && (
        <div className="border-b border-border/60 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Chats</p>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {quickContacts.map((item) => {
              const other = item.other;
              const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
              return (
                <button
                  key={item.convoId}
                  onClick={() => setActiveConversation({ id: item.convoId, otherUser: other })}
                  className="lift-on-tap relative shrink-0"
                >
                  <img src={avatarUrl} alt={other.display_name} className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30" />
                  {item.unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {item.unreadCount > 9 ? "9+" : item.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filter === "all" && (
        <div className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
            <span className="text-[10px] text-muted-foreground">24h</span>
          </div>

          <div className="scrollbar-hide mb-3 flex gap-3 overflow-x-auto pb-1">
            {notesByUser.map((note: any) => {
              const profile = note.profile;
              if (!profile) return null;
              const avatarUrl = profile.avatar_url || `https://i.pravatar.cc/100?u=${profile.user_id}`;
              const isMine = note.user_id === user.id;
              return (
                <div key={note.id} className="w-[148px] shrink-0 rounded-xl border border-border/60 bg-secondary/30 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <img src={avatarUrl} alt={profile.display_name} className="h-7 w-7 rounded-full object-cover" />
                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {isMine ? "Your note" : profile.username}
                    </p>
                  </div>
                  <p className="line-clamp-3 text-xs text-foreground/90">{note.content}</p>
                </div>
              );
            })}
            {!notesByUser.length && (
              <div className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                No active notes from your network
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={60}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={myNote ? `Update note: ${myNote.content}` : "Share a note..."}
              className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => void handleSaveNote()}
              disabled={!noteDraft.trim() || upsertInboxNote.isPending}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {upsertInboxNote.isPending ? "Saving" : "Post"}
            </button>
          </div>
        </div>
      )}

      {filter !== "archived" && incomingFollowRequests.length > 0 && (
        <div className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow Requests</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {incomingFollowRequests.length}
            </span>
          </div>
          <div className="space-y-2">
            {(incomingFollowRequests as IncomingFollowRequest[]).map((request) => {
              const profile = request.profile;
              if (!profile) return null;
              const isActing = actingRequestId === request.id;
              return (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                >
                  <button
                    onClick={() => navigate(`/profile/${profile.user_id}`)}
                    className="shrink-0"
                  >
                    <img
                      src={profile.avatar_url || `https://i.pravatar.cc/100?u=${profile.user_id}`}
                      alt={profile.display_name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => navigate(`/profile/${profile.user_id}`)}
                      className="truncate text-left text-sm font-semibold text-foreground"
                    >
                      {profile.display_name}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">@{profile.username} wants to follow you</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFollowRequest(request, false)}
                      disabled={isActing}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleFollowRequest(request, true)}
                      disabled={isActing}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Accept
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!!notifications.length && (
        <div ref={notificationsRef} className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
            <div className="flex items-center gap-2">
              {unreadMessageRequestNotifications > 0 && (
                <button
                  onClick={() => markMessageRequestNotificationsRead.mutate()}
                  className="text-[11px] font-semibold text-primary"
                >
                  Mark requests read
                </button>
              )}
              <button
                onClick={() => markAllNotificationsRead.mutate()}
                className="text-[11px] font-semibold text-primary"
              >
                Mark all read
              </button>
            </div>
          </div>

          {messageRequestConversations.length > 0 && (
            <button
              onClick={() => setFilter("requests")}
              className="mb-3 flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left"
            >
              <div>
                <p className="text-[11px] font-semibold text-foreground">Message requests</p>
                <p className="text-[10px] text-muted-foreground">Review and accept messages from people you don’t follow</p>
              </div>
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {messageRequestConversations.length > 9 ? "9+" : messageRequestConversations.length}
              </span>
            </button>
          )}

          <div className="space-y-3">
            {([
              { key: "today", label: "Today" },
              { key: "week", label: "This Week" },
              { key: "older", label: "Older" },
            ] as const).map((group) => {
              const list = groupedNotifications[group.key];
              if (!list.length) return null;
              return (
                <div key={group.key}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                  <div className="space-y-1.5">
                    {list.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left ${notification.is_read ? "border-border bg-secondary/40" : "border-primary/40 bg-primary/10"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground">{notification.title}</p>
                          {!!notification.body && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{notification.body}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!notification.is_read && (
                            <button
                              onClick={(event) => handleNotificationMarkRead(event, notification)}
                              className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                              aria-label="Mark read"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(event) => handleNotificationDelete(event, notification)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                            aria-label="Delete notification"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button onClick={() => { setShowNewChat(false); setNewChatQuery(""); }}>
              <X className="h-5 w-5 text-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">New Message</h2>
          </div>
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
                placeholder="Search people..."
                autoFocus
                className="w-full rounded-xl bg-secondary py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {searchResults && searchResults.length > 0 ? (
              searchResults.map((u: InboxUser) => (
                <button
                  key={u.user_id}
                  onClick={() => handleStartChat(u)}
                  className="lift-on-tap flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-secondary/50"
                >
                  <img
                    src={u.avatar_url || `https://i.pravatar.cc/100?u=${u.user_id}`}
                    alt={u.display_name}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{u.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  </div>
                </button>
              ))
            ) : newChatQuery.length >= 2 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users found</p>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Search for someone to message</p>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredConversations.length > 0 ? (
        <div>
          {filteredConversations.map((convo) => {
            const other = convo.otherParticipants?.[0];
            if (!other) return null;
            const lastMsg = convo.lastMessage;
            const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
            const preview = getPreview(lastMsg);
            const unreadCount = convo.unreadCount ?? 0;
            const isUnread = unreadCount > 0;
            const hasSnap = !!lastMsg?.is_snap;
            const settings = convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
            const typingCount = typingByConversation[convo.id] || 0;
            const isTyping = typingCount > 0;

            const isSwiped = swipedConversationId === convo.id;

            return (
              <div key={convo.id} className="relative overflow-hidden">
                <div className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3 transition-opacity ${isSwiped ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleSetting(convo.id, settings, "pinned");
                      setSwipedConversationId(null);
                    }}
                    className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold text-foreground"
                  >
                    {settings.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleSetting(convo.id, settings, "muted");
                      setSwipedConversationId(null);
                    }}
                    className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold text-foreground"
                  >
                    {settings.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleSetting(convo.id, settings, "archived");
                      setSwipedConversationId(null);
                    }}
                    className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
                  >
                    {settings.archived ? "Unarchive" : "Archive"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (isSwiped) {
                      setSwipedConversationId(null);
                      return;
                    }
                    setActiveConversation({ id: convo.id, otherUser: other });
                  }}
                  onTouchStart={(event) => handleConversationTouchStart(event, convo.id)}
                  onTouchEnd={(event) => handleConversationTouchEnd(event, convo.id)}
                  className={`lift-on-tap relative flex w-full items-center gap-3 px-4 py-3 transition-all active:bg-secondary/50 ${
                    isUnread ? "bg-secondary/30" : ""
                  } ${isSwiped ? "-translate-x-36" : "translate-x-0"}`}
                >
                <div className="relative">
                  <img
                    src={avatarUrl}
                    alt={other.display_name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  {isUnread && <Circle className="absolute -right-0.5 top-0 h-3.5 w-3.5 fill-primary text-primary" />}
                </div>
                <div className="flex-1 overflow-hidden text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className={`truncate text-sm font-semibold ${isUnread ? "text-foreground" : "text-foreground/90"}`}>
                        {other.display_name}
                      </p>
                      {settings.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      {settings.muted && <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {lastMsg && (
                        <span className={`text-[10px] ${isUnread ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                          {formatTime(lastMsg.created_at)}
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleToggleSetting(convo.id, settings, "pinned")}>
                            {settings.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                            {settings.pinned ? "Unpin" : "Pin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleSetting(convo.id, settings, "muted")}>
                            {settings.muted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
                            {settings.muted ? "Unmute" : "Mute"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleSetting(convo.id, settings, "archived")}>
                            <Archive className="mr-2 h-4 w-4" />
                            {settings.archived ? "Unarchive" : "Archive"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={`truncate text-xs ${isTyping ? "font-semibold text-primary" : isUnread ? "font-medium text-foreground/90" : "text-muted-foreground"}`}>
                      {isTyping ? (
                        typingCount > 1 ? "People are typing..." : "Typing..."
                      ) : hasSnap ? (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3 w-3" />
                          {preview}
                        </span>
                      ) : (
                        preview
                      )}
                    </p>
                    {filter === "requests" ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            updateConversationSettings
                              .mutateAsync({
                                conversationId: convo.id,
                                updates: { ...settings, archived: true },
                              })
                              .then(() =>
                                logMessageRequestAction.mutateAsync({
                                  conversationId: convo.id,
                                  action: "delete",
                                  surface: "inbox-thread",
                                }),
                              )
                              .catch(() => {
                                toast.error("Failed to update message request");
                              });
                          }}
                          className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            updateConversationSettings
                              .mutateAsync({
                                conversationId: convo.id,
                                updates: { ...settings, accepted_request: true, archived: false },
                              })
                              .then(() =>
                                logMessageRequestAction.mutateAsync({
                                  conversationId: convo.id,
                                  action: "accept",
                                  surface: "inbox-thread",
                                }),
                              )
                              .catch(() => {
                                toast.error("Failed to update message request");
                              });
                          }}
                          className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
                        >
                          Accept
                        </button>
                      </div>
                    ) : isUnread && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {inboxQuery || filter !== "all" ? "No chats found" : "No messages yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {inboxQuery || filter !== "all" ? "Try a different search/filter" : "Tap + to start a conversation"}
          </p>
        </div>
      )}
    </div>
  );
};

export default Inbox;
