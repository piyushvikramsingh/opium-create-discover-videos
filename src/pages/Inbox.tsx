import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from "react";
import { MessageCircle, Search, Plus, X, Flame, Circle, MoreHorizontal, Pin, PinOff, Bell, BellOff, Archive } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, useCreateConversation, useSearchUsers, useUpdateConversationSettings } from "@/hooks/useMessages";
import { useMarkAllNotificationsRead, useNotifications } from "@/hooks/useData";
import { useLocation, useNavigate } from "react-router-dom";
import ChatView from "../components/ChatView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

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
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const { data: conversations, isLoading } = useConversations(filter === "archived");
  const createConversation = useCreateConversation();
  const updateConversationSettings = useUpdateConversationSettings();
  const { data: notifications = [] } = useNotifications(10);
  const markAllNotificationsRead = useMarkAllNotificationsRead();

  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    otherUser: any;
  } | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const { data: searchResults } = useSearchUsers(newChatQuery);

  const handleToggleSetting = async (
    conversationId: string,
    currentSettings: { pinned: boolean; muted: boolean; archived: boolean },
    key: "pinned" | "muted" | "archived",
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

  const handleStartChat = async (targetUser: any) => {
    try {
      const conversationId = await createConversation.mutateAsync(targetUser.user_id);
      setActiveConversation({ id: conversationId, otherUser: targetUser });
      setShowNewChat(false);
      setNewChatQuery("");
    } catch (err: any) {
      console.error("Failed to start chat:", err);
    }
  };

  const getPreview = (lastMsg: any) => {
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
    const source = conversations ?? [];
    const query = inboxQuery.trim().toLowerCase();

    return source.filter((convo: any) => {
      const other = convo.otherParticipants?.[0];
      if (!other) return false;
      const archived = !!convo.settings?.archived;

      const matchFilter =
        filter === "archived"
          ? archived
          : filter === "unread"
            ? (convo.unreadCount ?? 0) > 0 && !archived
            : !archived;
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
    return (conversations ?? [])
      .map((convo: any) => ({
        convoId: convo.id,
        other: convo.otherParticipants?.[0],
        unreadCount: convo.unreadCount ?? 0,
        archived: !!convo.settings?.archived,
      }))
      .filter((item: any) => !!item.other && !item.archived)
      .slice(0, 12);
  }, [conversations]);

  const unreadTotal = useMemo(() => {
    return (conversations ?? []).reduce((acc: number, convo: any) => acc + (convo.unreadCount ?? 0), 0);
  }, [conversations]);

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
            onClick={() => setFilter("archived")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "archived" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {filter === "all" && !!quickContacts.length && (
        <div className="border-b border-border/60 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Chats</p>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {quickContacts.map((item: any) => {
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

      {!!notifications.length && (
        <div className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
            <button
              onClick={() => markAllNotificationsRead.mutate()}
              className="text-[11px] font-semibold text-primary"
            >
              Mark all read
            </button>
          </div>
          <div className="scrollbar-hide flex gap-2 overflow-x-auto">
            {notifications.map((notification: any) => (
              <div
                key={notification.id}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left ${notification.is_read ? "border-border bg-secondary/40" : "border-primary/40 bg-primary/10"}`}
              >
                <p className="text-[11px] font-semibold text-foreground">{notification.title}</p>
                {!!notification.body && <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-muted-foreground">{notification.body}</p>}
              </div>
            ))}
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
              searchResults.map((u: any) => (
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
          {filteredConversations.map((convo: any) => {
            const other = convo.otherParticipants?.[0];
            if (!other) return null;
            const lastMsg = convo.lastMessage;
            const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
            const preview = getPreview(lastMsg);
            const unreadCount = convo.unreadCount ?? 0;
            const isUnread = unreadCount > 0;
            const hasSnap = !!lastMsg?.is_snap;
            const settings = convo.settings || { pinned: false, muted: false, archived: false };

            return (
              <button
                key={convo.id}
                onClick={() => setActiveConversation({ id: convo.id, otherUser: other })}
                className={`lift-on-tap flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-secondary/50 ${
                  isUnread ? "bg-secondary/30" : ""
                }`}
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
                    <p className={`truncate text-xs ${isUnread ? "font-medium text-foreground/90" : "text-muted-foreground"}`}>
                      {hasSnap ? (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3 w-3" />
                          {preview}
                        </span>
                      ) : (
                        preview
                      )}
                    </p>
                    {isUnread && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
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
