import {
  Component,
  type ErrorInfo,
  type ReactNode,
  type TouchEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MessageCircle,
  Search,
  Plus,
  X,
  Flame,
  Circle,
  MoreHorizontal,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Archive,
  Loader2,
  ArrowLeft,
  Edit3,
  Users,
  Crown,
  Star,
  Clock,
  Shield,
  Globe,
  Lock,
  Timer,
  Zap,
  TrendingUp,
} from "lucide-react";
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
  useLogMessageRequestAction,
  useRespondFollowRequest,
  useUpsertInboxNote,
} from "@/hooks/useData";
import {
  useCommunityGroups,
  useChatStreaks,
  useCreateCommunityGroup,
  type CommunityGroup,
  type ChatStreak,
} from "@/hooks/useCommunityChat";
import { useLocation, useNavigate } from "react-router-dom";
import ChatView from "../components/ChatView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

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

type IncomingFollowRequest = {
  id: string;
  follower_id: string;
  profile?: InboxUser | null;
};

type TabType = "primary" | "community" | "requests";

// ── Error Boundary ─────────────────────────────────────────────────────

type ChatErrorBoundaryProps = { children: ReactNode; onBack: () => void };
type ChatErrorBoundaryState = { hasError: boolean; message: string };

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
          <p className="text-sm font-semibold text-foreground">Couldn't open this chat</p>
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

// ── Helper Components ──────────────────────────────────────────────────

const StreakBadge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  const color =
    count >= 100
      ? "from-yellow-400 to-orange-500"
      : count >= 30
        ? "from-orange-400 to-red-500"
        : count >= 7
          ? "from-red-400 to-pink-500"
          : "from-pink-400 to-purple-500";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r ${color} px-1.5 py-0.5 text-[11px] font-bold text-white`}
    >
      <Flame className="h-2.5 w-2.5" />
      {count}
    </span>
  );
};

const CommunityTypeBadge = ({ type }: { type: string }) => {
  const config: Record<string, { icon: ReactNode; label: string; className: string }> = {
    creator_circle: {
      icon: <Crown className="h-2.5 w-2.5" />,
      label: "Circle",
      className: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-amber-600",
    },
    fan_club: {
      icon: <Star className="h-2.5 w-2.5" />,
      label: "Fan Club",
      className: "bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-600",
    },
    event_group: {
      icon: <Zap className="h-2.5 w-2.5" />,
      label: "Event",
      className: "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600",
    },
    general: {
      icon: <Users className="h-2.5 w-2.5" />,
      label: "Group",
      className: "bg-secondary text-muted-foreground",
    },
  };
  const c = config[type] || config.general;

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
};

// ── Main Inbox ─────────────────────────────────────────────────────────

const Inbox = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Tab state: Primary | Community | Requests
  const [activeTab, setActiveTab] = useState<TabType>("primary");
  const { data: conversations, isLoading } = useConversations(false);
  const createConversation = useCreateConversation();
  const updateConversationSettings = useUpdateConversationSettings();
  const { data: inboxNotes = [] } = useInboxNotes(30);
  const upsertInboxNote = useUpsertInboxNote();
  const { data: incomingFollowRequests = [] } = useIncomingFollowRequests();
  const logMessageRequestAction = useLogMessageRequestAction();
  const respondFollowRequest = useRespondFollowRequest();
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [bulkRequestAction, setBulkRequestAction] = useState<null | "accept" | "delete">(null);
  const [swipedConversationId, setSwipedConversationId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Community hooks
  const { data: communityGroups = [], isLoading: communityLoading } = useCommunityGroups();
  const { data: streaks = [] } = useChatStreaks();
  const createCommunityGroup = useCreateCommunityGroup();

  // New chat modal
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewCommunity, setShowNewCommunity] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const { data: searchResults } = useSearchUsers(newChatQuery);
  const conversationIds = useMemo(
    () => ((conversations ?? []) as InboxConversation[]).map((convo) => convo.id),
    [conversations],
  );
  const { data: typingByConversation = {} } = useTypingConversations(conversationIds);

  // New community form
  const [communityName, setCommunityName] = useState("");
  const [communityDesc, setCommunityDesc] = useState("");
  const [communityType, setCommunityType] = useState<"creator_circle" | "fan_club" | "event_group" | "general">("general");
  const [communityPublic, setCommunityPublic] = useState(true);

  // Active chat
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    otherUser: InboxUser;
  } | null>(null);
  const [isReturningFromChat, setIsReturningFromChat] = useState(false);

  // Streak map for quick lookup
  const streakMap = useMemo(() => {
    const map = new Map<string, number>();
    (streaks as ChatStreak[]).forEach((s) => {
      map.set(s.conversation_id, s.streak_count);
    });
    return map;
  }, [streaks]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleToggleSetting = async (
    conversationId: string,
    currentSettings: { pinned?: boolean; muted?: boolean; archived?: boolean; accepted_request?: boolean },
    key: "pinned" | "muted" | "archived" | "accepted_request",
  ) => {
    try {
      await updateConversationSettings.mutateAsync({
        conversationId,
        updates: { ...currentSettings, [key]: !currentSettings[key] },
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

  const handleCreateCommunity = async () => {
    if (!communityName.trim()) return;
    try {
      await createCommunityGroup.mutateAsync({
        name: communityName.trim(),
        description: communityDesc.trim() || undefined,
        communityType: communityType,
        isPublic: communityPublic,
      });
      setShowNewCommunity(false);
      setCommunityName("");
      setCommunityDesc("");
      setCommunityType("general");
      setCommunityPublic(true);
    } catch {
      // toast handled by hook
    }
  };

  // ── Derived data ───────────────────────────────────────────────────

  const getPreview = (lastMsg?: InboxMessage | null) => {
    if (!lastMsg) return "No messages yet";
    if (lastMsg.is_snap) return lastMsg.viewed ? "Opened snap" : "New snap";
    if (lastMsg.media_type === "image") return "📷 Photo";
    if (lastMsg.media_type === "video") return "🎥 Video";
    if (lastMsg.media_type === "audio") return "🎤 Voice note";
    return lastMsg.content || "Message";
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "";
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

  // Primary: DMs (non-request, non-archived)
  const primaryConversations = useMemo(() => {
    const source = (conversations ?? []) as InboxConversation[];
    const query = inboxQuery.trim().toLowerCase();

    return source.filter((convo) => {
      const other = convo.otherParticipants?.[0];
      if (!other) return false;
      const archived = !!convo.settings?.archived;
      if (archived || !!convo.isMessageRequest) return false;

      if (!query) return true;
      const preview = getPreview(convo.lastMessage).toLowerCase();
      return (
        other.display_name?.toLowerCase().includes(query) ||
        other.username?.toLowerCase().includes(query) ||
        preview.includes(query)
      );
    });
  }, [conversations, inboxQuery]);

  // Requests: message requests
  const requestConversations = useMemo(() => {
    return ((conversations ?? []) as InboxConversation[]).filter(
      (convo) => !!convo.isMessageRequest && !convo.settings?.archived,
    );
  }, [conversations]);

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
    return ((conversations ?? []) as InboxConversation[]).reduce(
      (acc: number, convo) => acc + (convo.unreadCount ?? 0),
      0,
    );
  }, [conversations]);

  const activeTypingCount = useMemo(() => {
    return Object.values(typingByConversation).filter((count) => count > 0).length;
  }, [typingByConversation]);

  const handleBulkRequestAction = async (action: "accept" | "delete") => {
    if (bulkRequestAction) return;
    if (requestConversations.length === 0) return;
    try {
      setBulkRequestAction(action);
      for (const convo of requestConversations) {
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

  // ── Location state ─────────────────────────────────────────────────

  useEffect(() => {
    const state = location.state as
      | {
          openConversationId?: string;
          openUser?: InboxUser;
        }
      | undefined;

    if (!state?.openConversationId || !state?.openUser) return;
    setActiveConversation({ id: state.openConversationId, otherUser: state.openUser });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const focus = (location.state as { focus?: string } | null)?.focus;
    if (focus === "notifications") {
      navigate("/notifications", { replace: true });
    } else if (focus === "requests") {
      setActiveTab("requests");
    }
  }, [location.state, navigate]);

  // ── Auth guard ─────────────────────────────────────────────────────

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

  // ── Active chat view ───────────────────────────────────────────────

  const handleBackFromChat = () => {
    setIsReturningFromChat(true);
    setActiveConversation(null);
    window.setTimeout(() => setIsReturningFromChat(false), 280);
  };

  if (activeConversation) {
    return (
      <div className="chat-enter h-[100dvh] pb-16">
        <ChatErrorBoundary onBack={handleBackFromChat}>
          <ChatView
            conversationId={activeConversation.id}
            otherUser={activeConversation.otherUser}
            onBack={handleBackFromChat}
          />
        </ChatErrorBoundary>
      </div>
    );
  }

  // ── Render helpers ─────────────────────────────────────────────────

  const renderConversationRow = (convo: InboxConversation, showRequestActions = false) => {
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
    const streakCount = streakMap.get(convo.id) || 0;
    const isSwiped = swipedConversationId === convo.id;

    return (
      <div key={convo.id} className="relative overflow-hidden">
        <div
          className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3 transition-opacity ${
            isSwiped ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleToggleSetting(convo.id, settings, "pinned");
              setSwipedConversationId(null);
            }}
            className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground"
          >
            {settings.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleToggleSetting(convo.id, settings, "muted");
              setSwipedConversationId(null);
            }}
            className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground"
          >
            {settings.muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleToggleSetting(convo.id, settings, "archived");
              setSwipedConversationId(null);
            }}
            className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
          >
            Archive
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
          className={`lift-on-tap group relative mx-2 my-1.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors active:bg-secondary/50 ${
            isUnread
              ? "border-primary/30 bg-primary/8"
              : "border-border/70 bg-secondary/35"
          } ${isSwiped ? "-translate-x-36" : "translate-x-0"}`}
        >
          <div className="relative">
            <img src={avatarUrl} alt={other.display_name} className="h-12 w-12 rounded-full object-cover ring-2 ring-background transition-transform duration-200 group-hover:scale-[1.02]" />
            {isUnread && <Circle className="absolute -right-0.5 top-0 h-3.5 w-3.5 fill-primary text-primary" />}
          </div>
          <div className="flex-1 overflow-hidden text-left">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className={`truncate text-sm font-semibold ${isUnread ? "text-foreground" : "text-foreground/90"}`}>
                  {other.display_name}
                </p>
                {settings.pinned && <Pin className="h-3 w-3 text-primary" />}
                {settings.muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                {streakCount > 0 && <StreakBadge count={streakCount} />}
              </div>
              <div className="flex items-center gap-1.5">
                {lastMsg?.created_at && (
                  <span className={`text-[11px] ${isUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {formatTime(lastMsg.created_at)}
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-1 text-muted-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-secondary"
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
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p
                className={`truncate text-xs ${
                  isTyping
                    ? "font-semibold text-primary"
                    : isUnread
                      ? "font-medium text-foreground/90"
                      : "text-muted-foreground"
                }`}
              >
                {isTyping ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <span>{typingCount > 1 ? "People are typing" : "Typing"}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
                  </span>
                ) : hasSnap ? (
                  <span className="inline-flex items-center gap-1">
                    <Flame className="h-3 w-3" />
                    {preview}
                  </span>
                ) : (
                  preview
                )}
              </p>
              {showRequestActions ? (
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
                        .catch(() => toast.error("Failed to update message request"));
                    }}
                    className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
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
                        .catch(() => toast.error("Failed to update message request"));
                    }}
                    className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"
                  >
                    Accept
                  </button>
                </div>
              ) : (
                isUnread && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )
              )}
            </div>
          </div>
        </button>
      </div>
    );
  };

  // ── Render: Primary Tab ────────────────────────────────────────────

  const renderPrimaryTab = () => (
    <>
      {/* Quick Chats */}
      {!!quickContacts.length && (
        <div className="border-b border-border/60 bg-secondary/[0.05] px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Chats</p>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {quickContacts.map((item) => {
              const other = item.other!;
              const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
              const streakCount = streakMap.get(item.convoId) || 0;
              return (
                <button
                  key={item.convoId}
                  onClick={() => setActiveConversation({ id: item.convoId, otherUser: other })}
                  className="lift-on-tap relative shrink-0 rounded-2xl border border-border/60 bg-secondary/25 p-2 transition-colors hover:bg-secondary/35"
                >
                  <img
                    src={avatarUrl}
                    alt={other.display_name}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30"
                  />
                  {item.unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                      {item.unreadCount > 9 ? "9+" : item.unreadCount}
                    </span>
                  )}
                  {streakCount > 0 && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-orange-400 to-red-500 px-1 py-0.5 text-[8px] font-bold text-white">
                      <Flame className="h-2 w-2" />
                      {streakCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="border-b border-border/60 bg-secondary/[0.08] px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Timer className="h-3 w-3" />
            24h
          </span>
        </div>
        <div className="scrollbar-hide mb-3 flex gap-3 overflow-x-auto pb-1">
          {notesByUser.map((note: any) => {
            const profile = note.profile;
            if (!profile) return null;
            const avatarUrl = profile.avatar_url || `https://i.pravatar.cc/100?u=${profile.user_id}`;
            const isMine = note.user_id === user.id;
            return (
              <div
                key={note.id}
                className="w-[148px] shrink-0 rounded-xl border border-border/60 bg-secondary/30 p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-secondary/40"
              >
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

      {/* Follow Requests */}
      {incomingFollowRequests.length > 0 && (
        <div className="border-b border-border/60 bg-secondary/[0.08] px-4 py-3">
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
                  className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-secondary/40"
                >
                  <button onClick={() => navigate(`/profile/${profile.user_id}`)} className="shrink-0">
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

      {/* Chat List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : primaryConversations.length > 0 ? (
        <div className="space-y-0.5 py-1">{primaryConversations.map((convo) => renderConversationRow(convo))}</div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {inboxQuery ? "No chats found" : "No messages yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {inboxQuery ? "Try a different search" : "Tap + to start a conversation"}
          </p>
        </div>
      )}
    </>
  );

  // ── Render: Community Tab ──────────────────────────────────────────

  const renderCommunityTab = () => (
    <>
      {/* Streak Leaderboard */}
      {(streaks as ChatStreak[]).length > 0 && (
        <div className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Streaks</p>
          </div>
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {[...(streaks as ChatStreak[])]
              .sort((a, b) => b.streak_count - a.streak_count)
              .slice(0, 8)
              .map((streak) => {
                // Find the conversation for avatar
                const convo = ((conversations ?? []) as InboxConversation[]).find((c) => c.id === streak.conversation_id);
                const other = convo?.otherParticipants?.[0];
                if (!other) return null;
                const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
                return (
                  <button
                    key={streak.conversation_id}
                    onClick={() => {
                      if (convo) setActiveConversation({ id: convo.id, otherUser: other });
                    }}
                    className="lift-on-tap flex shrink-0 flex-col items-center gap-1"
                  >
                    <div className="relative">
                      <img
                        src={avatarUrl}
                        alt={other.display_name}
                        className="h-12 w-12 rounded-full object-cover ring-2 ring-orange-400/60"
                      />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-orange-400 to-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        <Flame className="h-2 w-2" />
                        {streak.streak_count}
                      </span>
                    </div>
                    <p className="max-w-[56px] truncate text-[11px] text-muted-foreground">{other.username}</p>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Community Groups */}
      {communityLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (communityGroups as CommunityGroup[]).length > 0 ? (
        <div className="divide-y divide-border/40">
          {(communityGroups as CommunityGroup[]).map((group) => {
            const avatarUrl = group.avatar_url || `https://i.pravatar.cc/100?u=${group.id}`;
            return (
              <button
                key={group.id}
                onClick={() => {
                  // Open community chat using same ChatView approach
                  setActiveConversation({
                    id: group.id,
                    otherUser: {
                      user_id: group.created_by,
                      username: group.name.toLowerCase().replace(/\s+/g, "_"),
                      display_name: group.name,
                      avatar_url: group.avatar_url,
                    },
                  });
                }}
                className="lift-on-tap flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-secondary/50"
              >
                <div className="relative">
                  <img src={avatarUrl} alt={group.name} className="h-12 w-12 rounded-xl object-cover" />
                  {group.is_paid && (
                    <Crown className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-amber-100 p-0.5 text-amber-600" />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                    <CommunityTypeBadge type={group.community_type} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {group.member_count}
                    </span>
                    {group.is_public ? (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Private
                      </span>
                    )}
                    {group.my_role === "owner" && (
                      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-600">
                        <Crown className="h-3 w-3" />
                        Owner
                      </span>
                    )}
                  </div>
                  {group.last_message_preview && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.last_message_preview}</p>
                  )}
                </div>
                {group.last_message_at && (
                  <span className="text-[11px] text-muted-foreground">{formatTime(group.last_message_at)}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">No communities yet</p>
          <p className="mt-1 max-w-[260px] text-center text-xs text-muted-foreground">
            Create a Creator Circle, Fan Club, or Event Group to build your community
          </p>
          <button
            onClick={() => setShowNewCommunity(true)}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Create Community
          </button>
        </div>
      )}
    </>
  );

  // ── Render: Requests Tab ───────────────────────────────────────────

  const renderRequestsTab = () => (
    <>
      {requestConversations.length > 0 && (
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {requestConversations.length} pending request{requestConversations.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      )}

      {requestConversations.length > 0 ? (
        <div className="py-1">{requestConversations.map((convo) => renderConversationRow(convo, true))}</div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">No message requests</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Messages from people you don't follow will appear here
          </p>
        </div>
      )}
    </>
  );

  // ── Main return ────────────────────────────────────────────────────

  return (
    <div className={`${isReturningFromChat ? "inbox-return" : "fade-in"} relative min-h-screen bg-background pb-24`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 right-[-14%] h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-[-14%] left-[-16%] h-72 w-72 rounded-full bg-secondary/45 blur-3xl" />
      </div>

      {/* Top Bar */}
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-full p-1.5 transition-colors hover:bg-secondary/70">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Messages</h1>
              <p className="text-[11px] text-muted-foreground">Stay synced across chats, communities, and requests</p>
            </div>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {unreadTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewChat(true)}
              className="rounded-full bg-secondary/85 p-2.5 text-foreground transition-colors hover:bg-secondary"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (activeTab === "community") {
                  setShowNewCommunity(true);
                } else {
                  setShowNewChat(true);
                }
              }}
              className="rounded-full bg-primary p-2.5 text-primary-foreground"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-2 py-0.5 text-[11px] font-semibold text-foreground">
              <MessageCircle className="h-3 w-3" />
              {primaryConversations.length} chats
            </span>
            {unreadTotal > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
                {unreadTotal} unread
              </span>
            )}
            {activeTypingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/55 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
                {activeTypingCount} typing
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative rounded-2xl border border-border/70 bg-secondary/45 px-2 transition-colors focus-within:border-primary/35 focus-within:bg-secondary/60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={inboxQuery}
              onChange={(e) => setInboxQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-2xl bg-transparent py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {!!inboxQuery && (
              <button
                onClick={() => setInboxQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs: Primary | Community | Requests */}
        <div className="mx-4 mb-3 flex items-center gap-1 rounded-2xl border border-border/70 bg-secondary/50 p-1">
          <button
            onClick={() => setActiveTab("primary")}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              activeTab === "primary" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              Primary
            </span>
          </button>
          <button
            onClick={() => setActiveTab("community")}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              activeTab === "community" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Community
              {(communityGroups as CommunityGroup[]).length > 0 && (
                <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1 text-[11px]">
                  {(communityGroups as CommunityGroup[]).length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("requests")}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              activeTab === "requests" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              Requests
              {requestConversations.length > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive/80 px-1.5 text-[11px] font-bold text-white">
                  {requestConversations.length}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "primary" && renderPrimaryTab()}
      {activeTab === "community" && renderCommunityTab()}
      {activeTab === "requests" && renderRequestsTab()}

      {/* Floating Create Button */}
      <button
        onClick={() => {
          if (activeTab === "community") {
            setShowNewCommunity(true);
          } else {
            setShowNewChat(true);
          }
        }}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-primary/25 bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <button
              onClick={() => {
                setShowNewChat(false);
                setNewChatQuery("");
              }}
              className="rounded-full p-1.5 hover:bg-secondary"
            >
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
                  className="lift-on-tap flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-secondary/50"
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

      {/* New Community Modal */}
      {showNewCommunity && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <button
              onClick={() => {
                setShowNewCommunity(false);
                setCommunityName("");
                setCommunityDesc("");
              }}
              className="rounded-full p-1.5 hover:bg-secondary"
            >
              <X className="h-5 w-5 text-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">Create Community</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Community Name</label>
              <input
                type="text"
                value={communityName}
                onChange={(e) => setCommunityName(e.target.value)}
                placeholder="e.g. Photography Lovers"
                maxLength={50}
                autoFocus
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Description</label>
              <textarea
                value={communityDesc}
                onChange={(e) => setCommunityDesc(e.target.value)}
                placeholder="What's this community about?"
                maxLength={200}
                rows={3}
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "general", label: "General", icon: <Users className="h-4 w-4" /> },
                    { value: "creator_circle", label: "Creator Circle", icon: <Crown className="h-4 w-4" /> },
                    { value: "fan_club", label: "Fan Club", icon: <Star className="h-4 w-4" /> },
                    { value: "event_group", label: "Event Group", icon: <Zap className="h-4 w-4" /> },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setCommunityType(item.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      communityType === item.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-3 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Public Community</p>
                <p className="text-xs text-muted-foreground">Anyone can discover and join</p>
              </div>
              <button
                onClick={() => setCommunityPublic(!communityPublic)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  communityPublic ? "bg-primary" : "bg-secondary-foreground/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    communityPublic ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <button
              onClick={() => void handleCreateCommunity()}
              disabled={!communityName.trim() || createCommunityGroup.isPending}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createCommunityGroup.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Community"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
