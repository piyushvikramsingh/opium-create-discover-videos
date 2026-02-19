import { useState, useRef, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Send,
  Camera,
  Image,
  Smile,
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
} from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SnapCamera from "@/components/SnapCamera";
import SnapViewer from "@/components/SnapViewer";
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
}

const ChatView = ({ conversationId, otherUser, onBack }: ChatViewProps) => {
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
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showSnapCamera, setShowSnapCamera] = useState(false);
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
  const signalingChannelRef = useRef<any>(null);
  const currentCallIdRef = useRef<string | null>(null);
  const callStatusRef = useRef<"idle" | "incoming" | "calling" | "connecting" | "active">("idle");
  const callTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const gesturePointerIdRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const readMarkRef = useRef<string | null>(null);
  const deliveredMarkRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const conversation = (allConversations || []).find((item: any) => item.id === conversationId);
  const conversationSettings = conversation?.settings || { pinned: false, muted: false, archived: false };

  const safeOtherUser = {
    user_id: otherUser?.user_id || "unknown",
    username: otherUser?.username || "unknown",
    display_name: otherUser?.display_name || "Unknown User",
    avatar_url: otherUser?.avatar_url || null,
  };

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
    const list = messages ?? [];
    const rows: Array<{ type: "day"; key: string; label: string } | { type: "message"; key: string; message: any }> = [];
    let lastDay = "";

    list.forEach((msg: any) => {
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
    const latestMine = [...messages].reverse().find((message: any) => message.sender_id === user.id && !message.is_snap);
    return latestMine?.id ?? null;
  }, [messages, user]);

  const getStatusLabel = (status?: string) => {
    if (status === "seen") return "Seen";
    if (status === "delivered") return "Delivered";
    return "Sent";
  };

  const quickEmojis = ["❤️", "😂", "🔥", "😍", "👍", "🙏", "🎉", "😮"];

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
    if (!conversationId || !user) return;

    const channel = supabase.channel(`call-${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "call-offer" }, async ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;

        if (callStatusRef.current !== "idle") {
          await sendSignal("call-reject", {
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
          handleEndCall(false);
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
        handleEndCall(false);
      })
      .on("broadcast", { event: "call-reject" }, ({ payload }) => {
        if (!payload || payload.toUserId !== user.id || payload.fromUserId === user.id) return;
        if (payload.callId !== currentCallIdRef.current) return;
        toast.error("Call declined");
        handleEndCall(false);
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

    const lastIncoming = [...messages]
      .reverse()
      .find((msg: any) => msg.sender_id !== user.id);

    if (!lastIncoming) return;
    if (readMarkRef.current === lastIncoming.id) return;

    readMarkRef.current = lastIncoming.id;
    markConversationRead.mutate({ conversationId });
  }, [messages, user, conversationId]);

  useEffect(() => {
    if (!messages || !user) return;

    const lastPendingDelivery = [...messages]
      .reverse()
      .find((message: any) => message.sender_id !== user.id && message.status === "sent" && !message.is_snap);

    if (!lastPendingDelivery) return;
    if (deliveredMarkRef.current === lastPendingDelivery.id) return;

    deliveredMarkRef.current = lastPendingDelivery.id;
    markConversationDelivered.mutate({ conversationId });
  }, [messages, user, conversationId]);

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

    setTypingStatus.mutate({ conversationId, isTyping: value.trim().length > 0 });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      setTypingStatus.mutate({ conversationId, isTyping: false });
    }, 1200);
  };

  const handleReaction = (message: any, emoji: string) => {
    const existing = (message.reactions || []).find((reaction: any) => reaction.user_id === user?.id);
    toggleReaction.mutate({
      conversationId,
      messageId: message.id,
      emoji,
      existingReaction: existing ? { id: existing.id, emoji: existing.emoji } : null,
    });
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

  const handleSend = async () => {
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
      }
      setText("");
      setReplyTo(null);
      setEditingMessageId(null);
      setTypingStatus.mutate({ conversationId, isTyping: false });
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
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);

      await sendMessage.mutateAsync({
        conversationId,
        mediaUrl: urlData.publicUrl,
        mediaType: "image",
        isSnap: true,
        snapDuration: 5,
        content: caption || undefined,
      });
      setShowSnapCamera(false);
      toast.success("Snap sent 🔥");
    } catch (err: any) {
      toast.error(err.message || "Failed to send snap");
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
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);

      await sendMessage.mutateAsync({
        conversationId,
        mediaUrl: urlData.publicUrl,
        mediaType: isVideo ? "video" : "image",
        isSnap: snapMode,
        snapDuration: snapMode ? 5 : undefined,
        content: text.trim() || undefined,
      });
      setText("");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenSnap = (msg: any) => {
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

  const sendSignal = async (event: string, payload: Record<string, any>) => {
    const channel = signalingChannelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  };

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

  const handleEndCall = (notifyRemote = true) => {
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
  };

  const handleRejectIncomingCall = async () => {
    if (!user || !incomingCall) return;
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
          const path = `${user.id}/${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from("chat-media")
            .upload(path, audioBlob, { contentType: "audio/webm" });
          if (uploadError) throw uploadError;

          const { data: audioUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);

          await sendMessage.mutateAsync({
            conversationId,
            mediaUrl: audioUrlData.publicUrl,
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

    if (deltaX <= -70) {
      stopVoiceRecording(true);
      return;
    }

    if (deltaY <= -70) {
      setIsRecordingLocked(true);
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
    stopVoiceRecording(false);
  };

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
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
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

      {incomingCall && callStatus === "incoming" && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center bg-background px-6">
          <img src={avatarUrl} alt={safeOtherUser.display_name} className="h-24 w-24 rounded-full object-cover" />
          <p className="mt-4 text-lg font-semibold text-foreground">Incoming {incomingCall.type} call</p>
          <p className="mt-1 text-sm text-muted-foreground">{safeOtherUser.display_name} is calling you</p>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={handleRejectIncomingCall}
              className="rounded-full bg-destructive p-4 text-destructive-foreground"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleAcceptIncomingCall}
              className="rounded-full bg-primary p-4 text-primary-foreground"
            >
              {incomingCall.type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {activeCall && callStatus !== "incoming" && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-background px-6">
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
          <img src={avatarUrl} alt={safeOtherUser.display_name} className="h-24 w-24 rounded-full object-cover" />
          <p className="mt-4 text-lg font-semibold text-foreground">{safeOtherUser.display_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {callStatus === "calling"
              ? "Ringing..."
              : callStatus === "connecting"
                ? "Connecting..."
                : `${activeCall.type === "video" ? "Video call" : "Voice call"} · ${formatDuration(callSeconds)}`}
          </p>

          {activeCall.type === "video" && (
            <div className="relative mt-4 h-64 w-44">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full rounded-2xl bg-black object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-2 right-2 h-20 w-14 rounded-xl border border-border bg-black object-cover"
              />
            </div>
          )}

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full bg-secondary p-4 text-foreground"
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => handleEndCall(true)}
              className="rounded-full bg-destructive p-4 text-destructive-foreground"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-full p-1.5 hover:bg-secondary/70">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <img src={avatarUrl} alt={safeOtherUser.display_name} className="h-9 w-9 rounded-full object-cover" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{safeOtherUser.display_name}</p>
            <p className="text-xs text-muted-foreground">@{safeOtherUser.username}</p>
          </div>
          <button
            onClick={() => setSnapMode(!snapMode)}
            className={`rounded-full p-2 transition-colors ${
              snapMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Flame className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isCallConnecting || callStatus !== "idle"}
            onClick={() => handleStartCall("voice")}
            className="rounded-full bg-secondary p-2 text-muted-foreground disabled:opacity-60"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isCallConnecting || callStatus !== "idle"}
            onClick={() => handleStartCall("video")}
            className="rounded-full bg-secondary p-2 text-muted-foreground disabled:opacity-60"
          >
            <Video className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full bg-secondary p-2 text-muted-foreground">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {snapMode && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Flame className="h-3 w-3" />
            Snap mode active
          </div>
        )}

        {!!typingUsers?.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            {typingUsers.length > 1 ? "People are typing..." : `${safeOtherUser.display_name} is typing...`}
          </p>
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
                  <div key={row.key} className="flex justify-center py-1.5">
                    <span className="rounded-full bg-secondary/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      {row.label}
                    </span>
                  </div>
                );
              }

              const msg = (row as any).message && typeof (row as any).message === "object" ? (row as any).message : {};
              const msgReply = msg.reply && typeof msg.reply === "object" && !Array.isArray(msg.reply) ? msg.reply : null;
              const msgReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
              const isMine = msg.sender_id === user?.id;
              const isSnap = msg.is_snap;
              const snapViewed = msg.viewed;

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
                      <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={row.key} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="group max-w-[78%]">
                    <div
                      className={`rounded-[20px] px-3 py-2 ${
                        isMine ? "bg-primary/90 text-primary-foreground" : "border border-border/50 bg-secondary/60 text-foreground"
                      }`}
                    >
                      {msgReply && (
                        <div
                          className={`mb-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                            isMine
                              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground/90"
                              : "border-border bg-background/70 text-muted-foreground"
                          }`}
                        >
                          {msgReply.deleted_at ? "Replying to deleted message" : msgReply.content || "Media"}
                        </div>
                      )}
                      {msg.deleted_at ? (
                        <p className="text-sm italic opacity-80">Message deleted</p>
                      ) : (
                        <>
                          {msg.media_url && (
                            <div className="mb-2 overflow-hidden rounded-xl">
                              {msg.media_type === "video" ? (
                                <video
                                  src={msg.media_url}
                                  className="max-h-56 w-full rounded-xl object-cover"
                                  controls
                                  playsInline
                                />
                              ) : msg.media_type === "audio" ? (
                                <audio
                                  src={msg.media_url}
                                  controls
                                  className="w-full rounded-xl"
                                />
                              ) : (
                                <img src={msg.media_url} alt="" className="max-h-56 w-full rounded-xl object-cover" />
                              )}
                            </div>
                          )}
                          {msg.content && <p className="break-words text-[14px] leading-5">{msg.content}</p>}
                        </>
                      )}
                      <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${isMine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                        <span>{msg.created_at ? formatTime(msg.created_at) : ""}</span>
                        {msg.edited_at && <span>· edited</span>}
                        {isMine && msg.id === lastOutgoingMessageId && (
                          <span className={`font-semibold ${msg.status === "seen" ? "text-primary-foreground" : ""}`}>
                            · {getStatusLabel(typeof msg.status === "string" ? msg.status : undefined)}
                          </span>
                        )}
                      </div>
                    </div>

                    {!!msgReactions.length && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
                        {Object.entries(
                          msgReactions.reduce((acc: Record<string, number>, reaction: any) => {
                            acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                            return acc;
                          }, {}),
                        ).map(([emoji, count]) => (
                          <button
                            key={`${msg.id}-${emoji}`}
                            onClick={() => handleReaction(msg, emoji)}
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground"
                          >
                            {emoji} {count as number}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`mt-1 hidden gap-1 group-hover:flex ${isMine ? "justify-end" : "justify-start"}`}>
                      {["❤️", "🔥", "😂", "👍"].map((emoji) => (
                        <button
                          key={`${msg.id}-${emoji}`}
                          type="button"
                          onClick={() => handleReaction(msg, emoji)}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs"
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
                        className="rounded-full bg-secondary p-1.5 text-muted-foreground"
                        aria-label="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      {isMine && !msg.deleted_at && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setReplyTo(null);
                              setText(msg.content || "");
                            }}
                            className="rounded-full bg-secondary p-1.5 text-muted-foreground"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="rounded-full bg-secondary p-1.5 text-destructive"
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
            <img src={avatarUrl} alt="" className="mb-3 h-16 w-16 rounded-full object-cover" />
            <p className="text-sm font-medium text-foreground">{safeOtherUser.display_name}</p>
            <p className="mt-1 text-xs">Send a message to start chatting</p>
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-background px-3 py-2 pb-safe">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleMedia}
        />

        {showEmojiTray && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-secondary/40 p-2.5">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  handleTypingChange(`${text}${emoji}`);
                  setShowEmojiTray(false);
                }}
                className="rounded-full bg-secondary px-2.5 py-1 text-sm"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {(replyTo || editingMessageId) && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-xs">
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
              className="text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="mb-1 flex items-center gap-2">
          <button
            onClick={() => setShowSnapCamera(true)}
            className={`rounded-full p-2 transition-colors ${
              snapMode ? "bg-primary text-primary-foreground" : "bg-secondary/80 text-muted-foreground"
            }`}
            aria-label="Open camera"
          >
            <Camera className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border/60 bg-secondary/65 px-3">
            <input
              type="text"
              value={text}
              onChange={(e) => handleTypingChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={editingMessageId ? "Edit message" : snapMode ? "Send a snap message..." : "Message"}
              className="h-9 w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => setShowEmojiTray((prev) => !prev)}
              className="text-muted-foreground"
              aria-label="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground"
              aria-label="Upload media"
            >
              <Image className="h-4 w-4" />
            </button>
          </div>

          {hasTypedText || editingMessageId ? (
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-40"
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
              className={`rounded-full p-2 text-primary-foreground disabled:opacity-40 ${
                isRecordingVoice ? "bg-destructive" : "bg-primary"
              }`}
              aria-label={isRecordingVoice ? "Release to send voice note" : "Hold to record voice note"}
            >
              {isRecordingVoice ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>

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
            {isRecordingLocked ? " · locked" : " · swipe left cancel / swipe up lock / release send"}
          </div>
        )}

        {isRecordingVoice && isRecordingLocked && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => stopVoiceRecording(true)}
              className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground"
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
