import {
  Component,
  type ErrorInfo,
  type ReactNode,
  type TouchEvent,
  useRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import BroadcastChannels from "@/components/BroadcastChannels";
import {
  MessageCircle,
  Search,
  Plus,
  X,
  Flame,
  Circle,
  MoreHorizontal,
  ChevronDown,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Archive,
  Loader2,
  ArrowLeft,
  Edit3,
  Camera,
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
  Check,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
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
import SnapCamera from "../components/SnapCamera";
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
  sender_id?: string;
  status?: string | null;
  deleted_at?: string | null;
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

type RowActionTarget = {
  convo: InboxConversation;
  other: InboxUser;
};

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
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const location = useLocation();

  // Tab state: Primary | Community | Requests
  const [activeTab, setActiveTab] = useState<TabType>("primary");
  const {
    data: conversations,
    isLoading,
    isFetching: isConversationsFetching,
    isError: isConversationsError,
    error: conversationsError,
    refetch: refetchConversations,
  } = useConversations(false);
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
  const [manuallyUnreadIds, setManuallyUnreadIds] = useState<Set<string>>(new Set());
  const [rowActionTarget, setRowActionTarget] = useState<RowActionTarget | null>(null);
  const [cameraPreviewTarget, setCameraPreviewTarget] = useState<RowActionTarget | null>(null);
  const [cameraPulseConversationId, setCameraPulseConversationId] = useState<string | null>(null);
  const rowLongPressTimeoutRef = useRef<number | null>(null);
  const rowLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRowTapConversationIdRef = useRef<string | null>(null);
  const cameraPreviewHoldTimeoutRef = useRef<number | null>(null);
  const cameraPulseTimeoutRef = useRef<number | null>(null);
  const cameraPreviewTriggeredRef = useRef(false);

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
    openCameraOnMount?: boolean;
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

  const clearRowLongPressTimer = () => {
    if (rowLongPressTimeoutRef.current !== null) {
      window.clearTimeout(rowLongPressTimeoutRef.current);
      rowLongPressTimeoutRef.current = null;
    }
  };

  const setManualUnread = (conversationId: string, unread: boolean) => {
    setManuallyUnreadIds((prev) => {
      const next = new Set(prev);
      if (unread) {
        next.add(conversationId);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
  };

  const openConversation = (conversationId: string, otherUser: InboxUser, options?: { openCameraOnMount?: boolean }) => {
    setManualUnread(conversationId, false);
    setActiveConversation({ id: conversationId, otherUser, openCameraOnMount: !!options?.openCameraOnMount });
  };

  const handleConversationLongPressStart = (event: TouchEvent, convo: InboxConversation, other: InboxUser) => {
    const point = event.touches[0];
    if (!point) return;

    rowLongPressStartRef.current = { x: point.clientX, y: point.clientY };
    clearRowLongPressTimer();

    rowLongPressTimeoutRef.current = window.setTimeout(() => {
      suppressRowTapConversationIdRef.current = convo.id;
      setRowActionTarget({ convo, other });
      rowLongPressTimeoutRef.current = null;
    }, 420);
  };

  const handleConversationLongPressMove = (event: TouchEvent) => {
    const start = rowLongPressStartRef.current;
    const point = event.touches[0];
    if (!start || !point) return;

    const dx = Math.abs(point.clientX - start.x);
    const dy = Math.abs(point.clientY - start.y);
    if (dx > 12 || dy > 12) {
      clearRowLongPressTimer();
    }
  };

  const handleConversationLongPressEnd = () => {
    clearRowLongPressTimer();
    rowLongPressStartRef.current = null;
  };

  const clearCameraPreviewHoldTimer = () => {
    if (cameraPreviewHoldTimeoutRef.current !== null) {
      window.clearTimeout(cameraPreviewHoldTimeoutRef.current);
      cameraPreviewHoldTimeoutRef.current = null;
    }
  };

  const clearCameraPulseTimer = () => {
    if (cameraPulseTimeoutRef.current !== null) {
      window.clearTimeout(cameraPulseTimeoutRef.current);
      cameraPulseTimeoutRef.current = null;
    }
  };

  const handleCameraQuickActionPressStart = (target: RowActionTarget) => {
    clearCameraPreviewHoldTimer();
    clearCameraPulseTimer();
    cameraPreviewTriggeredRef.current = false;
    cameraPreviewHoldTimeoutRef.current = window.setTimeout(() => {
      cameraPreviewTriggeredRef.current = true;
      setCameraPulseConversationId(target.convo.id);
      cameraPulseTimeoutRef.current = window.setTimeout(() => {
        setCameraPulseConversationId(null);
        cameraPulseTimeoutRef.current = null;
      }, 260);
      window.setTimeout(() => {
        setCameraPreviewTarget(target);
      }, 120);
      cameraPreviewHoldTimeoutRef.current = null;
    }, 320);
  };

  const handleCameraQuickActionPressEnd = () => {
    clearCameraPreviewHoldTimer();
  };

  const handleCameraQuickActionClick = (target: RowActionTarget) => {
    if (cameraPreviewTriggeredRef.current) {
      cameraPreviewTriggeredRef.current = false;
      return;
    }
    openConversation(target.convo.id, target.other, { openCameraOnMount: true });
  };

  const handleContinueFromCameraPreview = () => {
    if (!cameraPreviewTarget) return;
    const target = cameraPreviewTarget;
    setCameraPreviewTarget(null);
    openConversation(target.convo.id, target.other, { openCameraOnMount: true });
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

  useEffect(() => {
    return () => {
      clearRowLongPressTimer();
      clearCameraPreviewHoldTimer();
      clearCameraPulseTimer();
    };
  }, []);

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
    if (lastMsg.deleted_at) return "Message deleted";
    if (lastMsg.is_snap) return lastMsg.viewed ? "Opened snap" : "New snap";
    if (lastMsg.media_type === "image") return "📷 Photo";
    if (lastMsg.media_type === "video") return "🎥 Video";
    if (lastMsg.media_type === "audio") return "🎤 Voice note";
    return lastMsg.content || "Message";
  };

  const getMessageStatusMeta = (status?: string | null) => {
    if (status === "seen") {
      return { label: "Seen", Icon: CheckCheck, className: "text-primary" };
    }
    if (status === "delivered") {
      return { label: "Delivered", Icon: CheckCheck, className: "text-foreground/65" };
    }
    return { label: "Sent", Icon: Check, className: "text-muted-foreground" };
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
      const basePreview = getPreview(convo.lastMessage);
      const preview = (convo.lastMessage?.sender_id === user?.id ? `you: ${basePreview}` : basePreview).toLowerCase();
      return (
        other.display_name?.toLowerCase().includes(query) ||
        other.username?.toLowerCase().includes(query) ||
        preview.includes(query)
      );
    });
  }, [conversations, inboxQuery, user?.id]);

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
        lastMessage: convo.lastMessage,
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
    setManualUnread(state.openConversationId, false);
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
            openCameraOnMount={!!activeConversation.openCameraOnMount}
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
    const isOutgoingLastMessage = !!lastMsg && lastMsg.sender_id === user.id;
    const statusMeta = isOutgoingLastMessage ? getMessageStatusMeta(lastMsg.status) : null;
    const unreadCount = convo.unreadCount ?? 0;
    const isManualUnread = manuallyUnreadIds.has(convo.id);
    const isUnread = unreadCount > 0 || isManualUnread;
    const hasSnap = !!lastMsg?.is_snap;
    const settings = convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
    const typingCount = typingByConversation[convo.id] || 0;
    const isTyping = typingCount > 0;
    const streakCount = streakMap.get(convo.id) || 0;
    const isSwiped = swipedConversationId === convo.id;

    return (
      <div key={convo.id} className="ig-list-item-enter relative overflow-hidden border-b border-border/60 bg-background">
        <div
          className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3 transition-opacity ${
            isSwiped ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              setSwipedConversationId(null);
              handleCameraQuickActionClick({ convo, other });
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              handleCameraQuickActionPressStart({ convo, other });
            }}
            onPointerUp={handleCameraQuickActionPressEnd}
            onPointerCancel={handleCameraQuickActionPressEnd}
            onPointerLeave={handleCameraQuickActionPressEnd}
            className={`inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-all ${
              cameraPulseConversationId === convo.id ? "scale-105 ring-2 ring-primary/40 animate-pulse" : ""
            }`}
          >
            <Camera className="h-3 w-3" />
            Camera
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setSwipedConversationId(null);
              openConversation(convo.id, other);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground"
          >
            <MessageCircle className="h-3 w-3" />
            Message
          </button>
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
            if (suppressRowTapConversationIdRef.current === convo.id) {
              suppressRowTapConversationIdRef.current = null;
              return;
            }
            if (isSwiped) {
              setSwipedConversationId(null);
              return;
            }
            openConversation(convo.id, other);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setRowActionTarget({ convo, other });
          }}
          onTouchStart={(event) => {
            handleConversationTouchStart(event, convo.id);
            handleConversationLongPressStart(event, convo, other);
          }}
          onTouchMove={(event) => handleConversationLongPressMove(event)}
          onTouchEnd={(event) => {
            handleConversationTouchEnd(event, convo.id);
            handleConversationLongPressEnd();
          }}
          onTouchCancel={() => handleConversationLongPressEnd()}
          className={`ig-tap ig-row group relative flex w-full items-center gap-3 px-4 py-3 text-left ${
            isUnread ? "bg-primary/[0.04]" : ""
          } ${isSwiped ? "-translate-x-36" : "translate-x-0"}`}
        >
          <div className="relative shrink-0">
            {isUnread ? (
              <span className="ig-story-ring inline-block">
                <img src={avatarUrl} alt={other.display_name} className="block h-12 w-12 rounded-full object-cover ring-2 ring-background" />
              </span>
            ) : (
              <img src={avatarUrl} alt={other.display_name} className="block h-12 w-12 rounded-full object-cover" />
            )}
          </div>
          <div className="flex-1 overflow-hidden text-left">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className={`truncate text-[13px] font-semibold ${isUnread ? "text-foreground" : "text-foreground/90"}`}>
                  {other.display_name}
                </p>
                {settings.pinned && <Pin className="h-3 w-3 text-primary" />}
                {settings.muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                {streakCount > 0 && <StreakBadge count={streakCount} />}
              </div>
              <div className="flex items-center gap-1.5">
                {lastMsg?.created_at && (
                  <span className={`text-[10px] ${isUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
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
                    {isOutgoingLastMessage ? `You: ${preview}` : preview}
                  </span>
                ) : (
                  isOutgoingLastMessage ? `You: ${preview}` : preview
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
                <div className="flex items-center gap-1.5">
                  {!isTyping && statusMeta && (
                    <span
                      key={`${convo.id}-${statusMeta.label}`}
                      className={`ig-status-pop inline-flex items-center gap-0.5 text-[10px] font-medium leading-none ${statusMeta.className}`}
                    >
                      <statusMeta.Icon className="h-2.5 w-2.5" />
                      <span>{statusMeta.label}</span>
                    </span>
                  )}
                  {isUnread && (
                    <span
                      className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                      aria-label={unreadCount > 1 ? `${unreadCount} unread` : "unread"}
                    />
                  )}
                </div>
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
        <div className="border-b border-border/60 bg-background px-4 py-3">
          <p className="ig-section-label mb-2">Quick Chats</p>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {quickContacts.map((item) => {
              const other = item.other!;
              const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;
              const streakCount = streakMap.get(item.convoId) || 0;
              const isOutgoingLastMessage = !!item.lastMessage && item.lastMessage.sender_id === user.id;
              const quickStatusMeta = isOutgoingLastMessage ? getMessageStatusMeta(item.lastMessage?.status) : null;
              return (
                <button
                  key={item.convoId}
                  onClick={() => openConversation(item.convoId, other)}
                  className="ig-tap relative shrink-0 rounded-2xl p-1.5 transition-colors hover:bg-secondary/40"
                >
                  <span className={item.unreadCount > 0 ? "ig-story-ring inline-block" : "ig-story-ring ig-story-ring--muted inline-block"}>
                    <img
                      src={avatarUrl}
                      alt={other.display_name}
                      className="block h-14 w-14 rounded-full object-cover ring-2 ring-background"
                    />
                  </span>
                  {quickStatusMeta && (
                    <span
                      key={`${item.convoId}-${quickStatusMeta.label}`}
                      className={`absolute left-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/70 bg-background p-0.5 ${quickStatusMeta.className}`}
                      aria-label={`Last message ${quickStatusMeta.label.toLowerCase()}`}
                    >
                      <quickStatusMeta.Icon className="ig-status-pop h-2.5 w-2.5" />
                    </span>
                  )}
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

      {/* Instagram-style Notes — speech bubble above avatar */}
      <div className="border-b border-border/60 bg-background px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Timer className="h-3 w-3" />
            24h
          </span>
        </div>
        <div className="scrollbar-hide mb-3 flex gap-4 overflow-x-auto pb-1">
          {/* My note / Add note */}
          <button
            onClick={() => {
              const el = document.getElementById("note-input");
              el?.focus();
            }}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="relative">
              {myNote ? (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 max-w-[100px] rounded-xl rounded-bl-sm bg-card border border-border px-2 py-1 shadow-sm">
                  <p className="truncate text-[10px] text-foreground leading-tight">{myNote.content}</p>
                </div>
              ) : (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-xl rounded-bl-sm bg-secondary border border-border/60 px-2 py-1">
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">Share a note...</p>
                </div>
              )}
              <img
                src={user.user_metadata?.avatar_url || `https://i.pravatar.cc/100?u=${user.id}`}
                alt="You"
                className="mt-2 h-16 w-16 rounded-full object-cover ring-2 ring-primary/30"
              />
              {!myNote && (
                <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-3 w-3" />
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">Your note</p>
          </button>

          {/* Other people's notes */}
          {notesByUser
            .filter((note: any) => note.user_id !== user.id)
            .map((note: any) => {
              const profile = note.profile;
              if (!profile) return null;
              const avatarUrl = profile.avatar_url || `https://i.pravatar.cc/100?u=${profile.user_id}`;
              return (
                <div key={note.id} className="flex shrink-0 flex-col items-center gap-1">
                  <div className="relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 max-w-[100px] rounded-xl rounded-bl-sm bg-card border border-border px-2 py-1 shadow-sm">
                      <p className="truncate text-[10px] text-foreground leading-tight">{note.content}</p>
                    </div>
                    <img
                      src={avatarUrl}
                      alt={profile.display_name}
                      className="mt-2 h-16 w-16 rounded-full object-cover ring-2 ring-border"
                    />
                  </div>
                  <p className="max-w-[64px] truncate text-[11px] font-medium text-muted-foreground">
                    {profile.username}
                  </p>
                </div>
              );
            })}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="note-input"
            type="text"
            maxLength={60}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSaveNote(); }}
            placeholder={myNote ? `Update: ${myNote.content}` : "Share a note..."}
            className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => void handleSaveNote()}
            disabled={!noteDraft.trim() || upsertInboxNote.isPending}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {upsertInboxNote.isPending ? "..." : "Post"}
          </button>
        </div>
      </div>

      {/* Follow Requests */}
      {incomingFollowRequests.length > 0 && (
        <div className="border-b border-border/60 bg-background px-4 py-3">
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
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-secondary/20"
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
      ) : isConversationsError ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <MessageCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Couldn't load chats</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {conversationsError instanceof Error
              ? conversationsError.message
              : "Please check your connection and try again."}
          </p>
          <button
            onClick={() => {
              void refetchConversations();
            }}
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : primaryConversations.length > 0 ? (
        <div>{primaryConversations.map((convo) => renderConversationRow(convo))}</div>
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
      {/* Broadcast Channels */}
      <div className="border-b border-border/60">
        <BroadcastChannels />
      </div>
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
                      if (convo) openConversation(convo.id, other);
                    }}
                    className="ig-tap flex shrink-0 flex-col items-center gap-1"
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
        <div className="divide-y divide-border/60">
          {(communityGroups as CommunityGroup[]).map((group) => {
            const avatarUrl = group.avatar_url || `https://i.pravatar.cc/100?u=${group.id}`;
            return (
              <button
                key={group.id}
                onClick={() => {
                  // Open community chat using same ChatView approach
                  openConversation(group.id, {
                    user_id: group.created_by,
                    username: group.name.toLowerCase().replace(/\s+/g, "_"),
                    display_name: group.name,
                    avatar_url: group.avatar_url,
                  });
                }}
                className="ig-tap flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-secondary/50"
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
        <div>{requestConversations.map((convo) => renderConversationRow(convo, true))}</div>
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
    <div className={`${isReturningFromChat ? "inbox-return" : "ig-screen"} ig-screen-spring ig-modern-page relative min-h-screen bg-background pb-24`}>

      {/* Instagram-style Top Bar */}
      <div className="ig-header ig-modern-header sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="ig-tap rounded-full p-1 transition-colors hover:bg-secondary/70">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="text-[20px] font-bold tracking-tight text-foreground">
              {profile?.username || user?.user_metadata?.username || "Messages"}
            </h1>
            <ChevronDown className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewChat(true)}
              className="ig-tap ig-icon-btn rounded-full p-2 text-foreground transition-colors hover:bg-secondary/70"
              aria-label="Compose message"
            >
              <Edit3 className="h-[22px] w-[22px]" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="ig-modern-input relative px-2 transition-colors focus-within:border-primary/35">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={inboxQuery}
              onChange={(e) => setInboxQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl bg-transparent py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none"
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
        <div className="mb-2 flex items-center justify-center gap-6 border-t border-border/60 px-4 pt-2 text-sm font-semibold">
          <button
            onClick={() => setActiveTab("primary")}
            data-active={activeTab === "primary"}
            className={`relative px-1 py-1 transition-colors duration-200 ${
              activeTab === "primary" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Primary
            </span>
            {activeTab === "primary" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
          </button>
          <button
            onClick={() => setActiveTab("community")}
            data-active={activeTab === "community"}
            className={`relative px-1 py-1 transition-colors duration-200 ${
              activeTab === "community" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Community
              {(communityGroups as CommunityGroup[]).length > 0 && (
                <span className="ml-0.5 rounded-full bg-secondary px-1 text-[11px] text-muted-foreground">
                  {(communityGroups as CommunityGroup[]).length}
                </span>
              )}
            </span>
            {activeTab === "community" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            data-active={activeTab === "requests"}
            className={`relative px-1 py-1 transition-colors duration-200 ${
              activeTab === "requests" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Requests
              {requestConversations.length > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive/80 px-1.5 text-[11px] font-bold text-white">
                  {requestConversations.length}
                </span>
              )}
            </span>
            {activeTab === "requests" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="ig-tab-content-enter">
        {activeTab === "primary" && renderPrimaryTab()}
        {activeTab === "community" && renderCommunityTab()}
        {activeTab === "requests" && renderRequestsTab()}
      </div>

      {/* Floating Create Button */}
      <button
        onClick={() => {
          if (activeTab === "community") {
            setShowNewCommunity(true);
          } else {
            setShowNewChat(true);
          }
        }}
        aria-label={activeTab === "community" ? "Create community" : "Compose message"}
        className="ig-tap ig-icon-btn ig-fab-breathe fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-md transition-colors hover:bg-secondary/30"
      >
        <Plus className="h-7 w-7" />
      </button>

      {rowActionTarget && (
        <div className="ig-sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/45 p-3" onClick={() => setRowActionTarget(null)}>
          <div
            className="ig-sheet ig-modern-card w-full p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2">
              <p className="text-sm font-semibold text-foreground">{rowActionTarget.other.display_name}</p>
              <p className="text-xs text-muted-foreground">@{rowActionTarget.other.username}</p>
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  handleCameraQuickActionClick(rowActionTarget);
                  setRowActionTarget(null);
                }}
                onPointerDown={() => handleCameraQuickActionPressStart(rowActionTarget)}
                onPointerUp={handleCameraQuickActionPressEnd}
                onPointerCancel={handleCameraQuickActionPressEnd}
                onPointerLeave={handleCameraQuickActionPressEnd}
                className={`ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60 ${
                  cameraPulseConversationId === rowActionTarget.convo.id ? "ring-2 ring-primary/40 animate-pulse" : ""
                }`}
              >
                <Camera className="h-4 w-4" /> Camera
              </button>

              <button
                type="button"
                onClick={() => {
                  openConversation(rowActionTarget.convo.id, rowActionTarget.other);
                  setRowActionTarget(null);
                }}
                className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60"
              >
                <MessageCircle className="h-4 w-4" /> Message
              </button>

              <button
                type="button"
                onClick={async () => {
                  const settings = rowActionTarget.convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
                  await handleToggleSetting(rowActionTarget.convo.id, settings, "pinned");
                  setRowActionTarget(null);
                }}
                className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60"
              >
                {rowActionTarget.convo.settings?.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                {rowActionTarget.convo.settings?.pinned ? "Unpin" : "Pin"}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const settings = rowActionTarget.convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
                  await handleToggleSetting(rowActionTarget.convo.id, settings, "muted");
                  setRowActionTarget(null);
                }}
                className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60"
              >
                {rowActionTarget.convo.settings?.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {rowActionTarget.convo.settings?.muted ? "Unmute" : "Mute"}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const settings = rowActionTarget.convo.settings || { pinned: false, muted: false, archived: false, accepted_request: false };
                  await handleToggleSetting(rowActionTarget.convo.id, settings, "archived");
                  setRowActionTarget(null);
                }}
                className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60"
              >
                <Archive className="h-4 w-4" /> {rowActionTarget.convo.settings?.archived ? "Unarchive" : "Archive"}
              </button>

              <button
                type="button"
                onClick={() => {
                  const currentUnread = (rowActionTarget.convo.unreadCount ?? 0) > 0 || manuallyUnreadIds.has(rowActionTarget.convo.id);
                  setManualUnread(rowActionTarget.convo.id, !currentUnread);
                  setRowActionTarget(null);
                }}
                className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60"
              >
                <Circle className="h-4 w-4" />
                {((rowActionTarget.convo.unreadCount ?? 0) > 0 || manuallyUnreadIds.has(rowActionTarget.convo.id))
                  ? "Mark read"
                  : "Mark unread"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRowActionTarget(null)}
              className="ig-control-md mt-2 w-full border border-border/70 bg-background px-3 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {cameraPreviewTarget && (
        <SnapCamera
          previewOnly
          onClose={() => setCameraPreviewTarget(null)}
          onContinue={handleContinueFromCameraPreview}
        />
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="ig-screen ig-sheet-backdrop ig-modern-page fixed inset-0 z-50 flex flex-col bg-background">
          <div className="ig-header ig-modern-header flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3.5 backdrop-blur">
            <button
              onClick={() => {
                setShowNewChat(false);
                setNewChatQuery("");
              }}
              className="ig-tap rounded-full p-1.5 hover:bg-secondary"
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
                className="ig-modern-input ig-control-md w-full pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {searchResults && searchResults.length > 0 ? (
              searchResults.map((u: InboxUser) => (
                <button
                  key={u.user_id}
                  onClick={() => handleStartChat(u)}
                  className="ig-tap flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left transition-colors active:bg-secondary/35"
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
        <div className="ig-screen ig-sheet-backdrop ig-modern-page fixed inset-0 z-50 flex flex-col bg-background">
          <div className="ig-header ig-modern-header flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3.5 backdrop-blur">
            <button
              onClick={() => {
                setShowNewCommunity(false);
                setCommunityName("");
                setCommunityDesc("");
              }}
              className="ig-tap rounded-full p-1.5 hover:bg-secondary"
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
                className="ig-modern-input ig-control-md w-full px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
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
                className="ig-modern-input w-full resize-none rounded-2xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
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
                    className={`ig-control-md flex items-center gap-2 border px-3 text-sm font-medium transition-colors ${
                      communityType === item.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-3">
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
              className="ig-control-md w-full bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
