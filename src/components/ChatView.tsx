import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  Camera,
  Image,
  Smile,
  Heart,
  Check,
  CheckCheck,
  Flame,
  Circle,
  Phone,
  Video,
  Mic,
  StopCircle,
  PhoneOff,
  Volume2,
  VolumeX,
  Reply,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Archive,
  MoreVertical,
} from "lucide-react";
import {
  useMessages,
  useSendMessage,
  useMarkSnapViewed,
  useMarkConversationRead,
  useTypingStatus,
  useSetTypingStatus,
  useToggleReaction,
  useEditMessage,
  useDeleteMessage,
  useConversations,
  useUpdateConversationSettings,
  useMarkConversationDelivered,
  type ConversationSettings,
} from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { useLogMessageRequestAction } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { uploadChatMedia } from "@/lib/chatMedia";
import { useChatMediaUrl } from "@/hooks/useChatMediaUrl";
import { toast } from "sonner";
import SnapCamera from "@/components/SnapCamera";
import SnapViewer from "@/components/SnapViewer";
import ChatMediaPreview from "@/components/ChatMediaPreview";
import { useToggleVanishMode, useReportScreenshot } from "@/hooks/useGroupChat";
import {
  playMessageSentSound,
  playMessageReceivedSound,
  playIncomingCallRingtone,
  stopIncomingCallRingtone,
  playCallEndSound,
} from "@/hooks/useChatSounds";
import {
  usePinnedMessages,
  usePinMessage,
  useUnpinMessage,
  useChatStreak,
  useDisappearingMode,
  useToggleDisappearingMode,
  useSmartReplySuggestions,
} from "@/hooks/useCommunityChat";
import { GifStickerKeyboard } from "@/components/GifStickerKeyboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatViewProps {
  conversationId: string;
  otherUser: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  onBack: () => void;
  openCameraOnMount?: boolean;
}

type ChatReaction = {
  id: string;
  user_id: string;
  emoji: string;
};

type ChatReply = {
  id?: string;
  deleted_at?: string | null;
  content?: string | null;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  created_at: string;
  content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_snap?: boolean | null;
  viewed?: boolean | null;
  snap_duration?: number | null;
  status?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reactions?: ChatReaction[];
  reply?: ChatReply | null;
};

type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage };

// Smart Reply Suggestions inline component
const SmartReplySuggestions = ({
  messages,
  userId,
  text,
  editingMessageId,
  onSelect,
}: {
  messages?: ChatMessage[];
  userId?: string;
  text: string;
  editingMessageId: string | null;
  onSelect: (reply: string) => void;
}) => {
  // Find last incoming message
  const lastIncoming = useMemo(() => {
    if (!messages || !userId) return null;
    return [...messages].reverse().find((m) => m.sender_id !== userId && !m.deleted_at);
  }, [messages, userId]);

  const suggestions = useSmartReplySuggestions(lastIncoming?.content);

  if (!suggestions.length || text.trim() || editingMessageId) return null;

  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
      {suggestions.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onSelect(reply)}
          className="lift-on-tap shrink-0 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/15 hover:shadow-[0_6px_18px_hsl(var(--primary)/0.22)] active:scale-[0.98]"
        >
          {reply}
        </button>
      ))}
    </div>
  );
};

const ChatView = ({ conversationId, otherUser, onBack, openCameraOnMount = false }: ChatViewProps) => {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(conversationId);
  const { data: typingUsers } = useTypingStatus(conversationId);
  const { data: allConversations } = useConversations(true);
  const sendMessage = useSendMessage();
  const markViewed = useMarkSnapViewed();
  const markConversationRead = useMarkConversationRead();
  const markConversationDelivered = useMarkConversationDelivered();
  const setTypingStatus = useSetTypingStatus();
  const toggleReaction = useToggleReaction();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();
  const updateConversationSettings = useUpdateConversationSettings();
  const logMessageRequestAction = useLogMessageRequestAction();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [snapMode, setSnapMode] = useState(false);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [activeCall, setActiveCall] = useState<null | { type: "voice" | "video" }> (null);
  const [callStatus, setCallStatus] = useState<"idle" | "incoming" | "calling" | "connecting" | "active">("idle");
  const [incomingCall, setIncomingCall] = useState<null | {
    callId: string;
    fromUserId: string;
    type: "voice" | "video";
    offer: RTCSessionDescriptionInit;
  }>(null);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isRecordingLocked, setIsRecordingLocked] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingDragX, setRecordingDragX] = useState(0);
  const [recordingDragY, setRecordingDragY] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showSnapCamera, setShowSnapCamera] = useState(false);
  const [vanishMode, setVanishMode] = useState(false);
  const [showGifKeyboard, setShowGifKeyboard] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [swipeReply, setSwipeReply] = useState<{ messageId: string; offset: number } | null>(null);
  const toggleVanishMode = useToggleVanishMode();
  const reportScreenshot = useReportScreenshot();

  // Community chat features
  const { data: pinnedMessages = [] } = usePinnedMessages(conversationId);
  const pinMessage = usePinMessage();
  const unpinMessage = useUnpinMessage();
  const { data: chatStreak } = useChatStreak(conversationId);
  const { data: disappearingMode } = useDisappearingMode(conversationId);
  const toggleDisappearingMode = useToggleDisappearingMode();
  const [showPinnedBar, setShowPinnedBar] = useState(true);
  const [viewingSnap, setViewingSnap] = useState<{
    imageUrl: string;
    senderName: string;
    caption: string | null;
    duration: number;
    messageId: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const remoteCallStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<{ send: (payload: unknown) => Promise<unknown> } | null>(null);
  const currentCallIdRef = useRef<string | null>(null);
  const callStatusRef = useRef<"idle" | "incoming" | "calling" | "connecting" | "active">("idle");
  const callTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ messageId: string; at: number } | null>(null);
  const discardRecordingRef = useRef(false);
  const gesturePointerIdRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const readMarkRef = useRef<string | null>(null);
  const deliveredMarkRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingStateRef = useRef<boolean>(false);
  const sendSignalRef = useRef<(event: string, payload: Record<string, unknown>) => Promise<void>>(async () => {});
  const handleEndCallRef = useRef<(notifyRemote?: boolean) => void>(() => {});
  const messageItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messageSwipePointerIdRef = useRef<number | null>(null);
  const messageSwipeStartRef = useRef<{ messageId: string; x: number; y: number } | null>(null);
  const suppressTapMessageIdRef = useRef<string | null>(null);

  const conversation = (allConversations || []).find((item) => item?.id === conversationId);
  const conversationSettings: ConversationSettings = {
    pinned: !!conversation?.settings?.pinned,
    muted: !!conversation?.settings?.muted,
    archived: !!conversation?.settings?.archived,
    accepted_request: !!conversation?.settings?.accepted_request,
  };
  const isMessageRequestChat = !!conversation?.isMessageRequest && !conversationSettings.accepted_request && !conversationSettings.archived;

  const safeOtherUser = {
    user_id: otherUser?.user_id || "unknown",
    username: otherUser?.username || "unknown",
    display_name: otherUser?.display_name || "Unknown User",
    avatar_url: otherUser?.avatar_url || null,
  };

  // Track previous message count to detect new incoming messages
  const prevMessageCountRef = useRef<number>(0);
  useEffect(() => {
    const msgList = (messages ?? []) as ChatMessage[];
    if (msgList.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      const newest = msgList[msgList.length - 1];
      if (newest && newest.sender_id !== user?.id) {
        playMessageReceivedSound();
      }
    }
    prevMessageCountRef.current = msgList.length;
  }, [messages, user?.id]);

  useEffect(() => {
    readMarkRef.current = null;
    deliveredMarkRef.current = null;
    typingStateRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (!openCameraOnMount) return;
    setShowSnapCamera(true);
  }, [openCameraOnMount]);

  const avatarUrl = safeOtherUser.avatar_url || `https://i.pravatar.cc/100?u=${safeOtherUser.user_id}`;
  const hasTypedText = text.trim().length > 0;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const dayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const timeline = useMemo(() => {
    const list = (messages ?? []) as ChatMessage[];
    const rows: TimelineRow[] = [];
    let lastDay = "";

    list.forEach((msg) => {
      const label = dayLabel(msg.created_at);
      if (label !== lastDay) {
        rows.push({ type: "day", key: `day-${msg.id}`, label });
        lastDay = label;
      }
      rows.push({ type: "message", key: msg.id, message: msg });
    });

    return rows;
  }, [messages]);

  const lastOutgoingMessageId = useMemo(() => {
    if (!messages || !user) return null;
    const latestMine = [...(messages as ChatMessage[])].reverse().find((message) => message.sender_id === user.id && !message.is_snap);
    return latestMine?.id ?? null;
  }, [messages, user]);

  const getStatusMeta = (status?: string) => {
    if (status === "seen") {
      return {
        label: "Seen",
        Icon: CheckCheck,
        className: "text-primary-foreground",
      };
    }

    if (status === "delivered") {
      return {
        label: "Delivered",
        Icon: CheckCheck,
        className: "text-primary-foreground/80",
      };
    }

    return {
      label: "Sent",
      Icon: Check,
      className: "text-primary-foreground/65",
    };
  };

  const quickEmojis = ["❤️", "😂", "🔥", "😍", "👍", "🙏", "🎉", "😮"];
  const SWIPE_REPLY_TRIGGER_PX = 54;
  const SWIPE_REPLY_MAX_PX = 72;
  const CANCEL_THRESHOLD_PX = 70;
  const LOCK_THRESHOLD_PX = 70;

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`call-${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "call-offer" }, async ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;

        if (callStatusRef.current !== "idle") {
          await sendSignalRef.current("call-reject", {
            callId: payload.callId,
            fromUserId: user.id,
            toUserId: payload.fromUserId,
          });
          return;
        }

        currentCallIdRef.current = payload.callId;
        setIncomingCall({
          callId: payload.callId,
          fromUserId: payload.fromUserId,
          type: payload.type,
          offer: payload.offer,
        });
        setActiveCall({ type: payload.type });
        setCallStatus("incoming");
        playIncomingCallRingtone();
      })
      .on("broadcast", { event: "call-answer" }, async ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;
        if (payload.callId !== currentCallIdRef.current) return;
        const peer = peerConnectionRef.current;
        if (!peer) return;

        try {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
          setCallStatus("connecting");
        } catch {
          toast.error("Failed to connect call");
          handleEndCallRef.current(false);
        }
      })
      .on("broadcast", { event: "call-ice" }, async ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;
        if (payload.callId !== currentCallIdRef.current) return;
        const peer = peerConnectionRef.current;
        if (!peer || !payload.candidate) return;

        try {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          console.warn("Failed to add ICE candidate");
        }
      })
      .on("broadcast", { event: "call-end" }, ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;
        if (payload.callId !== currentCallIdRef.current) return;
        toast.info("Call ended");
        handleEndCallRef.current(false);
      })
      .on("broadcast", { event: "call-reject" }, ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;
        if (payload.callId !== currentCallIdRef.current) return;
        toast.error("Call declined");
        handleEndCallRef.current(false);
      })
      .subscribe();

    signalingChannelRef.current = channel;

    return () => {
      signalingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  useEffect(() => {
    if (!messages || !user) return;
    if (markConversationRead.isPending) return;

    const lastIncoming = [...messages]
      .reverse()
      .find((msg: ChatMessage) => msg.sender_id !== user.id);

    if (!lastIncoming) return;
    if (readMarkRef.current === lastIncoming.id) return;

    readMarkRef.current = lastIncoming.id;
    markConversationRead.mutate({ conversationId });
  }, [messages, user, conversationId, markConversationRead]);

  useEffect(() => {
    if (!messages || !user) return;
    if (markConversationDelivered.isPending) return;

    const lastPendingDelivery = [...messages]
      .reverse()
      .find((message: ChatMessage) => message.sender_id !== user.id && message.status === "sent" && !message.is_snap);

    if (!lastPendingDelivery) return;
    if (deliveredMarkRef.current === lastPendingDelivery.id) return;

    deliveredMarkRef.current = lastPendingDelivery.id;
    markConversationDelivered.mutate({ conversationId });
  }, [messages, user, conversationId, markConversationDelivered]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleTypingChange = (value: string) => {
    setText(value);
    if (!conversationId || !user) return;

    const isTyping = value.trim().length > 0;
    if (typingStateRef.current !== isTyping) {
      typingStateRef.current = isTyping;
      setTypingStatus.mutate({ conversationId, isTyping });
    }

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      if (!typingStateRef.current) return;
      typingStateRef.current = false;
      setTypingStatus.mutate({ conversationId, isTyping: false });
    }, 1200);
  };

  const handleReaction = (message: ChatMessage, emoji: string) => {
    const existing = (message.reactions || []).find((reaction) => reaction.user_id === user?.id);
    toggleReaction.mutate({
      conversationId,
      messageId: message.id,
      emoji,
      existingReaction: existing ? { id: existing.id, emoji: existing.emoji } : null,
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const openMessageActions = (message: ChatMessage) => {
    setActionMessage(message);
  };

  const handleMessageTouchStart = (message: ChatMessage) => {
    clearLongPressTimer();
    longPressTimeoutRef.current = window.setTimeout(() => {
      openMessageActions(message);
      longPressTimeoutRef.current = null;
    }, 420);
  };

  const handleMessageTouchEnd = () => {
    clearLongPressTimer();
  };

  const handleMessageTap = (message: ChatMessage) => {
    if (suppressTapMessageIdRef.current === message.id) {
      suppressTapMessageIdRef.current = null;
      return;
    }

    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.messageId === message.id && now - lastTapRef.current.at < 280) {
      handleReaction(message, "❤️");
      lastTapRef.current = null;
      return;
    }

    lastTapRef.current = { messageId: message.id, at: now };
  };

  const handleMessageSwipePointerDown = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    if (event.pointerType !== "touch") return;
    messageSwipePointerIdRef.current = event.pointerId;
    messageSwipeStartRef.current = { messageId: message.id, x: event.clientX, y: event.clientY };
    setSwipeReply({ messageId: message.id, offset: 0 });
  };

  const handleMessageSwipePointerMove = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    if (event.pointerType !== "touch") return;
    if (messageSwipePointerIdRef.current !== event.pointerId) return;

    const start = messageSwipeStartRef.current;
    if (!start || start.messageId !== message.id) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaY) > 48) {
      setSwipeReply({ messageId: message.id, offset: 0 });
      return;
    }

    const nextOffset = Math.max(0, Math.min(SWIPE_REPLY_MAX_PX, deltaX));
    if (nextOffset > 8) {
      clearLongPressTimer();
    }
    setSwipeReply({ messageId: message.id, offset: nextOffset });
  };

  const finishMessageSwipe = (message: ChatMessage) => {
    const activeOffset = swipeReply?.messageId === message.id ? swipeReply.offset : 0;
    const shouldReply = activeOffset >= SWIPE_REPLY_TRIGGER_PX;

    messageSwipePointerIdRef.current = null;
    messageSwipeStartRef.current = null;
    setSwipeReply(null);

    if (!shouldReply) return;

    suppressTapMessageIdRef.current = message.id;
    setReplyTo(message);
    setEditingMessageId(null);
    toast.message("Replying");
  };

  const handleMessageSwipePointerUp = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    if (event.pointerType !== "touch") return;
    if (messageSwipePointerIdRef.current !== event.pointerId) return;
    finishMessageSwipe(message);
  };

  const handleMessageSwipePointerCancel = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    if (event.pointerType !== "touch") return;
    if (messageSwipePointerIdRef.current !== event.pointerId) return;
    finishMessageSwipe(message);
  };

  const jumpToMessage = (messageId: string) => {
    const target = messageItemRefs.current.get(messageId);
    if (!target) {
      toast.message("Original message not available");
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1400);
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage.mutateAsync({ conversationId, messageId });
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setText("");
      }
      toast.success("Message deleted");
    } catch {
      toast.error("Failed to delete message");
    }
  };

  const handleToggleSetting = async (key: "pinned" | "muted" | "archived") => {
    if (updateConversationSettings.isPending) return;
    try {
      await updateConversationSettings.mutateAsync({
        conversationId,
        updates: { ...conversationSettings, [key]: !conversationSettings[key] },
      });
      toast.success("Chat updated");
    } catch {
      toast.error("Unable to update chat");
    }
  };

  const handleMessageRequestAction = async (action: "accept" | "delete") => {
    if (updateConversationSettings.isPending) return;
    try {
      await updateConversationSettings.mutateAsync({
        conversationId,
        updates:
          action === "accept"
            ? { ...conversationSettings, accepted_request: true, archived: false }
            : { ...conversationSettings, archived: true },
      });
      await logMessageRequestAction.mutateAsync({
        conversationId,
        action,
        surface: "chat-banner",
      });
      toast.success(action === "accept" ? "Message request accepted" : "Message request deleted");
      if (action === "delete") onBack();
    } catch {
      toast.error("Failed to update request");
    }
  };

  const handleSend = async () => {
    if (!conversationId || !user) return;
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      if (editingMessageId) {
        await editMessage.mutateAsync({
          conversationId,
          messageId: editingMessageId,
          content: trimmed,
        });
        toast.success("Message updated");
      } else {
        await sendMessage.mutateAsync({
          conversationId,
          content: trimmed,
          isSnap: snapMode,
          snapDuration: snapMode ? 5 : undefined,
          replyToMessageId: replyTo?.id,
        });
        playMessageSentSound();
      }
      setText("");
      setReplyTo(null);
      setEditingMessageId(null);
      if (typingStateRef.current) {
        typingStateRef.current = false;
        setTypingStatus.mutate({ conversationId, isTyping: false });
      }
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSnapCapture = async (file: File, caption: string) => {
    if (!user) return;

    setSending(true);
    try {
      const path = await uploadChatMedia(user.id, file, file.name, file.type);

      await sendMessage.mutateAsync({
        conversationId,
        mediaUrl: path,
        mediaType: "image",
        isSnap: true,
        snapDuration: 5,
        content: caption || undefined,
      });
      setShowSnapCamera(false);
      toast.success("Snap sent 🔥");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send snap";
      toast.error(message || "Failed to send snap");
    } finally {
      setSending(false);
    }
  };

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Only images and videos are supported");
      return;
    }

    setSending(true);
    try {
      const path = await uploadChatMedia(user.id, file, file.name, file.type);

      await sendMessage.mutateAsync({
        conversationId,
        mediaUrl: path,
        mediaType: isVideo ? "video" : "image",
        isSnap: snapMode,
        snapDuration: snapMode ? 5 : undefined,
        content: text.trim() || undefined,
      });
      setText("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message || "Upload failed");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenSnap = (msg: ChatMessage) => {
    if (!msg.media_url && !msg.content) return;
    const isMine = msg.sender_id === user?.id;

    setViewingSnap({
      imageUrl: msg.media_url || "",
      senderName: isMine ? "You" : safeOtherUser.display_name,
      caption: msg.content,
      duration: msg.snap_duration || 5,
      messageId: msg.id,
    });

    if (!isMine && !msg.viewed) {
      markViewed.mutate({ messageId: msg.id, conversationId });
    }
  };

  const sendSignal = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = signalingChannelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  }, []);

  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  const createPeerConnection = (callId: string) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate || !user) return;
      sendSignal("call-ice", {
        callId,
        fromUserId: user.id,
        toUserId: safeOtherUser.user_id,
        candidate: event.candidate,
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      remoteCallStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
      setCallStatus("active");
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        handleEndCall(false);
      }
    };

    peerConnectionRef.current = peer;
    return peer;
  };

  const attachLocalTracks = (peer: RTCPeerConnection) => {
    const localStream = localCallStreamRef.current;
    if (!localStream) return;
    localStream.getTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });
  };

  const handleStartCall = async (type: "voice" | "video") => {
    if (!user || callStatus !== "idle") return;

    try {
      setIsCallConnecting(true);
      const callId = crypto.randomUUID();
      currentCallIdRef.current = callId;
      const constraints = type === "video" ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localCallStreamRef.current = stream;
      setIsMuted(false);
      setCallSeconds(0);
      setActiveCall({ type });

      const peer = createPeerConnection(callId);
      attachLocalTracks(peer);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      await sendSignal("call-offer", {
        callId,
        fromUserId: user.id,
        toUserId: safeOtherUser.user_id,
        type,
        offer,
      });

      setCallStatus("calling");
      toast.success(type === "video" ? "Ringing video call..." : "Ringing voice call...");
    } catch {
      handleEndCall(false);
      toast.error("Unable to access microphone/camera");
    } finally {
      setIsCallConnecting(false);
    }
  };

  const handleEndCall = useCallback((notifyRemote = true) => {
    stopIncomingCallRingtone();
    playCallEndSound();
    const callId = currentCallIdRef.current;
    if (notifyRemote && user && callId) {
      sendSignal("call-end", {
        callId,
        fromUserId: user.id,
        toUserId: safeOtherUser.user_id,
      });
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localCallStreamRef.current) {
      localCallStreamRef.current.getTracks().forEach((track) => track.stop());
      localCallStreamRef.current = null;
    }
    if (remoteCallStreamRef.current) {
      remoteCallStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteCallStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (callTimerRef.current) {
      window.clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    currentCallIdRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setCallStatus("idle");
    setCallSeconds(0);
    setIsMuted(false);
  }, [sendSignal, safeOtherUser.user_id, user]);

  useEffect(() => {
    handleEndCallRef.current = handleEndCall;
  }, [handleEndCall]);

  const handleRejectIncomingCall = async () => {
    if (!user || !incomingCall) return;
    stopIncomingCallRingtone();
    await sendSignal("call-reject", {
      callId: incomingCall.callId,
      fromUserId: user.id,
      toUserId: incomingCall.fromUserId,
    });
    currentCallIdRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setCallStatus("idle");
  };

  const handleAcceptIncomingCall = async () => {
    if (!user || !incomingCall) return;
    stopIncomingCallRingtone();

    try {
      setIsCallConnecting(true);
      currentCallIdRef.current = incomingCall.callId;
      setActiveCall({ type: incomingCall.type });
      setCallStatus("connecting");

      const constraints = incomingCall.type === "video" ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localCallStreamRef.current = stream;

      const peer = createPeerConnection(incomingCall.callId);
      attachLocalTracks(peer);

      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await sendSignal("call-answer", {
        callId: incomingCall.callId,
        fromUserId: user.id,
        toUserId: incomingCall.fromUserId,
        answer,
      });

      setIncomingCall(null);
      setCallStatus("active");
    } catch {
      handleEndCall(false);
      toast.error("Failed to accept call");
    } finally {
      setIsCallConnecting(false);
    }
  };

  const toggleMute = () => {
    const stream = localCallStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const stopVoiceRecording = async (discard = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    discardRecordingRef.current = discard;

    recorder.stop();
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecordingVoice(false);
    setIsRecordingLocked(false);
    setRecordingSeconds(0);
    setRecordingDragX(0);
    setRecordingDragY(0);
    gesturePointerIdRef.current = null;
    gestureStartRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!user || isRecordingVoice) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const startedAt = recordingStartedAtRef.current;
        recordingStartedAtRef.current = null;
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        audioChunksRef.current = [];

        const shouldDiscard = discardRecordingRef.current;
        discardRecordingRef.current = false;
        if (shouldDiscard) {
          toast.message("Voice note canceled");
          return;
        }

        const durationMs = startedAt ? Date.now() - startedAt : 0;
        if (durationMs < 500) {
          return;
        }

        if (!audioBlob.size) return;

        setSending(true);
        try {
          const path = await uploadChatMedia(user.id, audioBlob, "voice.webm", "audio/webm");

          await sendMessage.mutateAsync({
            conversationId,
            mediaUrl: path,
            mediaType: "audio",
            content: undefined,
          });
          toast.success("Voice note sent");
        } catch {
          toast.error("Failed to send voice note");
        } finally {
          setSending(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      setRecordingDragX(0);
      setRecordingDragY(0);
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const handleVoiceHoldStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (hasTypedText || isRecordingVoice || sending) return;
    gesturePointerIdRef.current = event.pointerId;
    gestureStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsRecordingLocked(false);
    startVoiceRecording();
  };

  const handleVoiceHoldMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRecordingVoice || isRecordingLocked) return;
    if (gesturePointerIdRef.current !== event.pointerId) return;

    const start = gestureStartRef.current;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    setRecordingDragX(deltaX);
    setRecordingDragY(deltaY);

    if (deltaX <= -CANCEL_THRESHOLD_PX) {
      stopVoiceRecording(true);
      return;
    }

    if (deltaY <= -LOCK_THRESHOLD_PX) {
      setIsRecordingLocked(true);
      setRecordingDragX(0);
      setRecordingDragY(0);
      toast.message("Recording locked");
    }
  };

  const handleVoiceHoldEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!isRecordingVoice) return;
    if (gesturePointerIdRef.current !== null) {
      try {
        event.currentTarget.releasePointerCapture(gesturePointerIdRef.current);
      } catch {
        // no-op
      }
    }
    if (isRecordingLocked) return;
    setRecordingDragX(0);
    setRecordingDragY(0);
    stopVoiceRecording(false);
  };

  const cancelProgress = Math.min(Math.max(-recordingDragX / CANCEL_THRESHOLD_PX, 0), 1);
  const lockProgress = Math.min(Math.max(-recordingDragY / LOCK_THRESHOLD_PX, 0), 1);
  const isNearCancel = cancelProgress >= 0.6;
  const isNearLock = lockProgress >= 0.6;

  useEffect(() => {
    if (!activeCall || callStatus !== "active") return;

    callTimerRef.current = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (callTimerRef.current) {
        window.clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [activeCall, callStatus]);

  useEffect(() => {
    if (!activeCall || activeCall.type !== "video") return;
    if (!localVideoRef.current || !localCallStreamRef.current) return;

    localVideoRef.current.srcObject = localCallStreamRef.current;
  }, [activeCall, callStatus]);

  useEffect(() => {
    return () => {
      handleEndCall(false);
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [handleEndCall]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ig-modern-page relative flex h-full flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 right-[-16%] h-60 w-60 rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute bottom-[-14%] left-[-18%] h-72 w-72 rounded-full bg-secondary/40 blur-3xl" />
        <div className="absolute inset-x-8 top-[28%] h-40 rounded-full bg-primary/8 blur-3xl" />
      </div>
      {showSnapCamera && (
        <SnapCamera
          onCapture={handleSnapCapture}
          onClose={() => setShowSnapCamera(false)}
          sending={sending}
        />
      )}

      {viewingSnap && (
        <SnapViewer
          imageUrl={viewingSnap.imageUrl}
          senderName={viewingSnap.senderName}
          caption={viewingSnap.caption}
          duration={viewingSnap.duration}
          onClose={() => setViewingSnap(null)}
        />
      )}

      {/* ── Instagram-style Incoming Call Screen ── */}
      {incomingCall && callStatus === "incoming" && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center bg-gradient-to-b from-[hsl(var(--background))] via-[hsl(var(--muted))] to-[hsl(var(--background))] px-6">
          {/* Animated rings */}
          <div className="relative flex items-center justify-center">
            <span className="absolute h-36 w-36 animate-ping rounded-full border border-primary/20" style={{ animationDuration: "2s" }} />
            <span className="absolute h-32 w-32 animate-ping rounded-full border border-primary/30" style={{ animationDuration: "1.5s", animationDelay: "0.3s" }} />
            <span className="absolute h-28 w-28 rounded-full border-2 border-primary/40 animate-pulse" />
            <img src={avatarUrl} alt={safeOtherUser.display_name} className="relative h-24 w-24 rounded-full object-cover ring-4 ring-primary/50 shadow-lg" />
          </div>
          <p className="mt-6 text-xl font-bold text-foreground">{safeOtherUser.display_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Incoming {incomingCall.type === "video" ? "video" : "voice"} call…
          </p>

          <div className="mt-12 flex items-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleRejectIncomingCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive shadow-lg shadow-destructive/30 transition-transform active:scale-90"
              >
                <PhoneOff className="h-6 w-6 text-destructive-foreground" />
              </button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleAcceptIncomingCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30 transition-transform active:scale-90"
              >
                {incomingCall.type === "video" ? <Video className="h-6 w-6 text-white" /> : <Phone className="h-6 w-6 text-white" />}
              </button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Instagram-style Active Call Screen ── */}
      {activeCall && callStatus !== "incoming" && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-[hsl(var(--background))] via-[hsl(var(--muted)/0.5)] to-[hsl(var(--background))]">
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          {/* Video call: fullscreen layout */}
          {activeCall.type === "video" ? (
            <>
              {/* Remote video fills screen */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full bg-muted object-cover"
              />
              {/* Local video pip */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute right-4 top-14 h-40 w-28 rounded-2xl border-2 border-background/60 bg-muted object-cover shadow-xl z-10"
              />
              {/* Top bar over video */}
              <div className="relative z-10 flex items-center justify-between px-4 pt-safe pb-2 bg-gradient-to-b from-black/50 to-transparent">
                <div className="flex items-center gap-3">
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white/30" />
                  <div>
                    <p className="text-sm font-semibold text-white">{safeOtherUser.display_name}</p>
                    <p className="text-[11px] text-white/70">
                      {callStatus === "calling" ? "Ringing…" : callStatus === "connecting" ? "Connecting…" : formatDuration(callSeconds)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Voice call: centered avatar with status */
            <div className="flex flex-1 flex-col items-center justify-center px-6">
              <div className="relative">
                {callStatus === "calling" && (
                  <span className="absolute inset-0 m-auto h-32 w-32 animate-ping rounded-full border border-primary/20" style={{ animationDuration: "2s" }} />
                )}
                <img src={avatarUrl} alt={safeOtherUser.display_name} className="relative h-28 w-28 rounded-full object-cover ring-4 ring-primary/30 shadow-lg" />
              </div>
              <p className="mt-6 text-xl font-bold text-foreground">{safeOtherUser.display_name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {callStatus === "calling"
                  ? "Ringing…"
                  : callStatus === "connecting"
                    ? "Connecting…"
                    : `Voice call · ${formatDuration(callSeconds)}`}
              </p>
            </div>
          )}

          {/* Bottom controls bar */}
          <div className="relative z-10 mt-auto bg-gradient-to-t from-black/60 to-transparent pb-safe pt-6">
            <div className="flex items-center justify-center gap-6 pb-6">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all active:scale-90 ${
                  isMuted ? "bg-white/90 text-foreground" : "bg-white/20 text-white backdrop-blur"
                }`}
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => handleEndCall(true)}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive shadow-lg shadow-destructive/40 transition-transform active:scale-90"
              >
                <PhoneOff className="h-6 w-6 text-destructive-foreground" />
              </button>
              {activeCall.type === "video" && (
                <button
                  type="button"
                  onClick={() => {
                    // Toggle camera (front/back)
                    const videoTrack = localCallStreamRef.current?.getVideoTracks()[0];
                    if (videoTrack) {
                      videoTrack.enabled = !videoTrack.enabled;
                    }
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-all active:scale-90"
                >
                  <Video className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ig-modern-header sticky top-0 z-10 border-b border-border/70 bg-background/90 px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-full p-2 transition-all duration-200 hover:-translate-x-0.5 hover:bg-secondary/70">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="relative">
            <img src={avatarUrl} alt={safeOtherUser.display_name} className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/30" />
            {!!typingUsers?.length && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background bg-emerald-400" />}
          </div>
          <div className="flex-1">
            <p className="ig-type-h2 text-foreground">{safeOtherUser.display_name}</p>
            <p className="ig-type-caption">@{safeOtherUser.username}</p>
          </div>
          <button
            onClick={() => setSnapMode(!snapMode)}
            className={`rounded-full p-2 transition-colors ${
              snapMode ? "bg-primary text-primary-foreground" : "bg-secondary/85 text-muted-foreground"
            } hover:scale-105 active:scale-95`}
          >
            <Flame className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isCallConnecting || callStatus !== "idle"}
            onClick={() => handleStartCall("voice")}
            className="rounded-full bg-secondary/85 p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isCallConnecting || callStatus !== "idle"}
            onClick={() => handleStartCall("video")}
            className="rounded-full bg-secondary/85 p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <Video className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full bg-secondary/85 p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleToggleSetting("pinned")}>
                {conversationSettings.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                {conversationSettings.pinned ? "Unpin chat" : "Pin chat"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleToggleSetting("muted")}>
                {conversationSettings.muted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
                {conversationSettings.muted ? "Unmute chat" : "Mute chat"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleToggleSetting("archived")}>
                <Archive className="mr-2 h-4 w-4" />
                {conversationSettings.archived ? "Unarchive chat" : "Archive chat"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const newVal = !vanishMode;
                  setVanishMode(newVal);
                  toggleVanishMode.mutate({ conversationId, enabled: newVal });
                  toast(newVal ? "Vanish mode on — messages disappear after viewing" : "Vanish mode off");
                }}
              >
                <Flame className="mr-2 h-4 w-4" />
                {vanishMode ? "Turn off vanish mode" : "Turn on vanish mode"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const isEnabled = disappearingMode?.enabled ?? false;
                  toggleDisappearingMode.mutate({ conversationId, enabled: !isEnabled, durationHours: 24 });
                }}
              >
                <Circle className="mr-2 h-4 w-4" />
                {disappearingMode?.enabled ? "Turn off disappearing (24h)" : "Disappearing messages (24h)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Streak Badge */}
        {chatStreak && chatStreak.streak_count > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-500">
            <Flame className="h-3 w-3" />
            {chatStreak.streak_count} day streak
            {chatStreak.streak_count === chatStreak.longest_streak && chatStreak.streak_count >= 7 && " 🏆"}
          </div>
        )}

        {/* Disappearing mode indicator */}
        {disappearingMode?.enabled && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-500">
            <Circle className="h-3 w-3" />
            Disappearing · {disappearingMode.duration_hours}h
          </div>
        )}

        {snapMode && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Flame className="h-3 w-3" />
            Snap mode active
          </div>
        )}

        {/* Pinned messages banner */}
        {showPinnedBar && (pinnedMessages as any[]).length > 0 && (
          <button
            onClick={() => setShowPinnedBar(false)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2 text-left transition-colors hover:bg-primary/10"
          >
            <Pin className="h-3.5 w-3.5 text-primary" />
            <p className="flex-1 truncate text-[11px] font-medium text-foreground">
              {(pinnedMessages as any[])[0]?.message_content || "Pinned message"}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {(pinnedMessages as any[]).length > 1 ? `+${(pinnedMessages as any[]).length - 1} more` : ""}
            </span>
          </button>
        )}

        {!!typingUsers?.length && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/45 px-2.5 py-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
            </span>
            <span>{typingUsers.length > 1 ? "People are typing..." : `${safeOtherUser.display_name} is typing...`}</span>
          </div>
        )}

        {isMessageRequestChat && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-2">
            <div>
              <p className="text-[11px] font-semibold text-foreground">Message request</p>
              <p className="text-[11px] text-muted-foreground">Accept to move this chat into your inbox</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleMessageRequestAction("delete")}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => handleMessageRequestAction("accept")}
                className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
              >
                Accept
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-hide flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : timeline.length > 0 ? (
          <div className="space-y-2">
            {timeline.map((row) => {
              if (!row || typeof row !== "object") {
                return null;
              }

              if (row.type === "day") {
                return (
                  <div key={row.key} className="flex justify-center py-2">
                    <span className="rounded-full border border-border/70 bg-secondary/65 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      {row.label}
                    </span>
                  </div>
                );
              }

              const msg = row.type === "message" ? row.message : null;
              if (!msg) return null;
              const msgReply = msg.reply && typeof msg.reply === "object" && !Array.isArray(msg.reply) ? msg.reply : null;
              const msgReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
              const isMine = msg.sender_id === user?.id;
              const isSnap = msg.is_snap;
              const snapViewed = msg.viewed;
              const isStoryReplyMessage = typeof msg.content === "string" && msg.content.startsWith("Story reply: ");
              const renderedMessageContent = isStoryReplyMessage ? msg.content?.replace(/^Story reply:\s*/, "") : msg.content;

              if (isSnap && snapViewed && !isMine) {
                return (
                  <div key={row.key} className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-2.5">
                      <Flame className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Snap opened</span>
                    </div>
                  </div>
                );
              }

              if (isSnap && !snapViewed && !isMine) {
                return (
                  <div key={row.key} className="flex justify-start">
                    <button
                      onClick={() => handleOpenSnap(msg)}
                      className="lift-on-tap flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-4 py-3"
                    >
                      <Flame className="h-5 w-5 text-primary-foreground" />
                      <span className="text-sm font-semibold text-primary-foreground">Tap to view Snap</span>
                    </button>
                  </div>
                );
              }

              if (isSnap && isMine) {
                return (
                  <div key={row.key} className="flex justify-end">
                    <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/20 px-4 py-2.5">
                      <Flame className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">{snapViewed ? "Snap opened" : "Snap sent"}</span>
                      <span className="text-[11px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              }

              const shouldShowLastMessageStatus = isMine && msg.id === lastOutgoingMessageId && !msg.deleted_at;
              const statusMeta = shouldShowLastMessageStatus
                ? getStatusMeta(typeof msg.status === "string" ? msg.status : undefined)
                : null;
              const swipeOffset = swipeReply?.messageId === msg.id ? swipeReply.offset : 0;
              const swipeProgress = Math.min(swipeOffset / SWIPE_REPLY_TRIGGER_PX, 1);

              return (
                <div key={row.key} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    ref={(node) => {
                      if (!node) {
                        messageItemRefs.current.delete(msg.id);
                        return;
                      }
                      messageItemRefs.current.set(msg.id, node);
                    }}
                    className="group relative max-w-[78%]"
                  >
                    <span
                      className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-background/85 p-1 text-muted-foreground transition-all duration-150 ${
                        swipeOffset > 0 ? "opacity-100" : "opacity-0"
                      }`}
                      style={{
                        transform: `translateY(-50%) scale(${0.9 + swipeProgress * 0.1})`,
                        color: swipeProgress >= 1 ? "hsl(var(--primary))" : undefined,
                      }}
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </span>
                    <div
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openMessageActions(msg);
                      }}
                      onPointerDown={(event) => handleMessageSwipePointerDown(event, msg)}
                      onPointerMove={(event) => handleMessageSwipePointerMove(event, msg)}
                      onPointerUp={(event) => handleMessageSwipePointerUp(event, msg)}
                      onPointerCancel={(event) => handleMessageSwipePointerCancel(event, msg)}
                      onTouchStart={() => handleMessageTouchStart(msg)}
                      onTouchEnd={handleMessageTouchEnd}
                      onTouchCancel={handleMessageTouchEnd}
                      onTouchMove={handleMessageTouchEnd}
                      onClick={() => handleMessageTap(msg)}
                      onDoubleClick={() => handleReaction(msg, "❤️")}
                      className={`rounded-[20px] px-3 py-2 transition-colors ${
                        isMine
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/60 bg-secondary/75 text-foreground"
                      } ${highlightedMessageId === msg.id ? "ring-2 ring-primary/45" : ""}`}
                      style={{ transform: `translateX(${swipeOffset}px)` }}
                    >
                      {msgReply && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (msgReply.id) jumpToMessage(msgReply.id);
                          }}
                          className={`mb-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                            isMine
                              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground/90"
                              : "border-border bg-background/70 text-muted-foreground"
                          } ${msgReply.id ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {msgReply.deleted_at ? "Replying to deleted message" : msgReply.content || "Media"}
                        </button>
                      )}
                      {msg.deleted_at ? (
                        <p className="text-sm italic opacity-80">Message deleted</p>
                      ) : (
                        <>
                          {msg.media_url && (
                            <div className="mb-2 overflow-hidden rounded-xl">
                              <ChatMediaPreview src={msg.media_url} mediaType={msg.media_type} />
                            </div>
                          )}
                          {isStoryReplyMessage && (
                            <p
                              className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                                isMine ? "text-primary-foreground/80" : "text-muted-foreground"
                              }`}
                            >
                              Replied to your story
                            </p>
                          )}
                          {renderedMessageContent && <p className="break-words text-[14px] leading-5">{renderedMessageContent}</p>}
                        </>
                      )}
                      <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${isMine ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                        <span>{msg.created_at ? formatTime(msg.created_at) : ""}</span>
                        {msg.edited_at && <span>· edited</span>}
                        {statusMeta && (
                          <span
                            key={`${msg.id}-${statusMeta.label}`}
                            className={`ig-status-pop inline-flex items-center gap-0.5 text-[10px] font-medium leading-none ${statusMeta.className}`}
                          >
                            <span className="opacity-80">·</span>
                            <statusMeta.Icon className="h-2.5 w-2.5" />
                            <span>{statusMeta.label}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {!!msgReactions.length && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
                        {Object.entries(
                          msgReactions.reduce((acc: Record<string, number>, reaction: ChatReaction) => {
                            acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                            return acc;
                          }, {}),
                        ).map(([emoji, count]) => (
                          <button
                            key={`${msg.id}-${emoji}`}
                            onClick={() => handleReaction(msg, emoji)}
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-secondary/90"
                          >
                            {emoji} {count as number}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`mt-1 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${isMine ? "justify-end" : "justify-start"}`}>
                      {["❤️", "🔥", "😂", "👍"].map((emoji) => (
                        <button
                          key={`${msg.id}-${emoji}`}
                          type="button"
                          onClick={() => handleReaction(msg, emoji)}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs transition-colors hover:bg-secondary/90"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(msg);
                          setEditingMessageId(null);
                        }}
                        className="rounded-full bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      {/* Pin message */}
                      {!msg.deleted_at && (
                        <button
                          type="button"
                          onClick={() => {
                            const isPinned = (pinnedMessages as any[]).some((p: any) => p.message_id === msg.id);
                            if (isPinned) {
                              unpinMessage.mutate({ conversationId, messageId: msg.id });
                            } else {
                              pinMessage.mutate({ conversationId, messageId: msg.id });
                            }
                          }}
                          className="rounded-full bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Pin"
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isMine && !msg.deleted_at && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setReplyTo(null);
                              setText(msg.content || "");
                            }}
                            className="rounded-full bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="rounded-full bg-secondary p-1.5 text-destructive transition-colors hover:bg-destructive/15"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <img src={avatarUrl} alt="" className="mb-3 h-16 w-16 rounded-full object-cover ring-2 ring-primary/30" />
            <p className="text-sm font-medium text-foreground">{safeOtherUser.display_name}</p>
            <p className="mt-1 text-xs">Send a message to start chatting</p>
          </div>
        )}
      </div>

      {actionMessage && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/50 p-3" onClick={() => setActionMessage(null)}>
          <div
            className="ig-panel-enter w-full rounded-2xl border border-border bg-background p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap gap-2">
              {["❤️", "😂", "🔥", "👍", "😍", "😮"].map((emoji) => (
                <button
                  key={`${actionMessage.id}-${emoji}`}
                  onClick={() => {
                    handleReaction(actionMessage, emoji);
                    setActionMessage(null);
                  }}
                  className="ig-tap ig-icon-btn rounded-full border border-border/70 bg-background px-3 py-1 text-base"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setReplyTo(actionMessage);
                  setEditingMessageId(null);
                  setActionMessage(null);
                }}
                className="ig-tap ig-icon-btn flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary/60"
              >
                <Reply className="h-4 w-4" /> Reply
              </button>

              {!actionMessage.deleted_at && (
                <button
                  type="button"
                  onClick={() => {
                    const isPinned = (pinnedMessages as any[]).some((p: any) => p.message_id === actionMessage.id);
                    if (isPinned) {
                      unpinMessage.mutate({ conversationId, messageId: actionMessage.id });
                    } else {
                      pinMessage.mutate({ conversationId, messageId: actionMessage.id });
                    }
                    setActionMessage(null);
                  }}
                  className="ig-tap ig-icon-btn flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary/60"
                >
                  <Pin className="h-4 w-4" /> {(pinnedMessages as any[]).some((p: any) => p.message_id === actionMessage.id) ? "Unpin" : "Pin"}
                </button>
              )}

              {!!actionMessage.content && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(actionMessage.content || "");
                      toast.success("Copied");
                    } catch {
                      toast.error("Could not copy");
                    }
                    setActionMessage(null);
                  }}
                  className="ig-tap ig-icon-btn flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary/60"
                >
                  <Send className="h-4 w-4" /> Copy text
                </button>
              )}

              {actionMessage.sender_id === user?.id && !actionMessage.deleted_at && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessageId(actionMessage.id);
                      setReplyTo(null);
                      setText(actionMessage.content || "");
                      setActionMessage(null);
                    }}
                    className="ig-tap ig-icon-btn flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary/60"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteMessage(actionMessage.id);
                      setActionMessage(null);
                    }}
                    className="ig-tap ig-icon-btn ig-control-md flex w-full items-center gap-2 px-3 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="ig-control-md mt-2 w-full border border-border/70 bg-background px-3 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="ig-modern-header border-t border-border/60 bg-background/95 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleMedia}
        />

        {/* Smart Reply Suggestions */}
        <SmartReplySuggestions
          messages={messages as ChatMessage[] | undefined}
          userId={user?.id}
          text={text}
          editingMessageId={editingMessageId}
          onSelect={(reply) => {
            setText(reply);
            // Auto-send if tapped
            if (!editingMessageId && conversationId && user) {
              sendMessage.mutate({
                conversationId,
                content: reply,
                isSnap: snapMode,
                snapDuration: snapMode ? 5 : undefined,
              });
            }
          }}
        />

        {showEmojiTray && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-secondary/50 p-2.5">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  handleTypingChange(`${text}${emoji}`);
                  setShowEmojiTray(false);
                }}
                className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-sm transition-colors hover:border-primary/35 hover:bg-background"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {(replyTo || editingMessageId) && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{editingMessageId ? "Editing message" : "Replying"}</p>
              {replyTo && <p className="truncate text-muted-foreground">{replyTo.content || "Media"}</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                setReplyTo(null);
                setEditingMessageId(null);
                setText("");
              }}
              className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="mb-1 flex items-center gap-2">
          <button
            onClick={() => setShowSnapCamera(true)}
            className={`ig-control-icon transition-colors ${
              snapMode ? "bg-primary text-primary-foreground" : "bg-secondary/80 text-muted-foreground"
            } hover:bg-secondary`}
            aria-label="Open camera"
          >
            <Camera className="h-4 w-4" />
          </button>
          <div className="ig-modern-input ig-control-input flex min-w-0 flex-1 items-center gap-2 bg-secondary/70 px-3 transition-colors focus-within:border-primary/40 focus-within:bg-secondary/85">
            <input
              type="text"
              value={text}
              onChange={(e) => handleTypingChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={editingMessageId ? "Edit message" : snapMode ? "Send a snap message..." : "Message"}
              className="h-10 w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => { setShowGifKeyboard((prev) => !prev); setShowEmojiTray(false); }}
              className="ig-tap rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="GIF & Stickers"
              title="GIFs & Stickers"
            >
              <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-bold leading-none">GIF</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowEmojiTray((prev) => !prev); setShowGifKeyboard(false); }}
              className="ig-tap rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ig-tap rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Upload media"
            >
              <Image className="h-4 w-4" />
            </button>
          </div>

          {hasTypedText || editingMessageId ? (
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="ig-control-icon bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              aria-label={editingMessageId ? "Save message" : "Send message"}
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={handleVoiceHoldStart}
              onPointerMove={handleVoiceHoldMove}
              onPointerUp={handleVoiceHoldEnd}
              onPointerCancel={() => {
                if (isRecordingVoice && !isRecordingLocked) {
                  stopVoiceRecording(true);
                }
              }}
              disabled={sending}
              className={`ig-control-icon text-primary-foreground transition-all disabled:opacity-40 ${
                isRecordingVoice ? "bg-destructive shadow-[0_0_0_6px_hsl(var(--destructive)/0.18)]" : "bg-primary"
              }`}
              aria-label={isRecordingVoice ? "Release to send voice note" : "Hold to record voice note"}
            >
              {isRecordingVoice ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>

        {isRecordingVoice && !isRecordingLocked && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/45 px-3 py-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
                isNearCancel ? "bg-destructive/15 text-destructive" : "text-muted-foreground"
              }`}
            >
              ← Slide to cancel
            </span>
            <span className="text-destructive">{formatDuration(recordingSeconds)}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
                isNearLock ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              ↑ Slide to lock
            </span>
          </div>
        )}

        {showGifKeyboard && (
          <div className="mb-2 rounded-2xl border border-border/60 bg-secondary/35 p-2">
            <GifStickerKeyboard
              isOpen={true}
              onSelectGif={(gif) => {
                sendMessage.mutate({
                  conversationId,
                  content: gif.url,
                  mediaUrl: gif.url,
                  mediaType: "image",
                  isSnap: false,
                });
                setShowGifKeyboard(false);
              }}
              onSelectSticker={(sticker) => {
                sendMessage.mutate({
                  conversationId,
                  content: sticker.image_url,
                  mediaUrl: sticker.image_url,
                  mediaType: "image",
                  isSnap: false,
                });
                setShowGifKeyboard(false);
              }}
              onClose={() => setShowGifKeyboard(false)}
            />
          </div>
        )}

        {vanishMode && (
          <div className="mb-1 flex items-center gap-1.5 pl-1 text-[11px] text-primary">
            <Flame className="h-3 w-3" />
            Vanish mode · Messages disappear after viewing
          </div>
        )}

        {sending && (
          <div className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
            <Circle className="h-2.5 w-2.5 animate-pulse fill-muted-foreground text-muted-foreground" />
            Sending...
          </div>
        )}

        {isRecordingVoice && (
          <div className="flex items-center gap-1.5 pl-1 text-[11px] text-destructive">
            <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
            Recording voice note · {formatDuration(recordingSeconds)}
            {isRecordingLocked ? " · locked" : " · release to send"}
          </div>
        )}

        {isRecordingVoice && isRecordingLocked && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => stopVoiceRecording(true)}
              className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/85"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => stopVoiceRecording(false)}
              className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatView;
