import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Send, Camera, Image, Smile, Flame } from "lucide-react";
import { useMessages, useSendMessage, useMarkSnapViewed } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SnapCamera from "@/components/SnapCamera";
import SnapViewer from "@/components/SnapViewer";

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
  const sendMessage = useSendMessage();
  const markViewed = useMarkSnapViewed();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [snapMode, setSnapMode] = useState(false);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await sendMessage.mutateAsync({
        conversationId,
        content: trimmed,
        isSnap: snapMode,
        snapDuration: snapMode ? 5 : undefined,
      });
      setText("");
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

      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(path);

      await sendMessage.mutateAsync({
        conversationId,
        mediaUrl: urlData.publicUrl,
        mediaType: "image",
        isSnap: true,
        snapDuration: 5,
        content: caption || undefined,
      });
      setShowSnapCamera(false);
      toast.success("Snap sent! 🔥");
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

      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(path);

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
      senderName: isMine ? "You" : otherUser.display_name,
      caption: msg.content,
      duration: msg.snap_duration || 5,
      messageId: msg.id,
    });

    // Mark as viewed if not mine
    if (!isMine && !msg.viewed) {
      markViewed.mutate({ messageId: msg.id, conversationId });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const avatarUrl = otherUser.avatar_url || `https://i.pravatar.cc/100?u=${otherUser.user_id}`;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Snap camera overlay */}
      {showSnapCamera && (
        <SnapCamera
          onCapture={handleSnapCapture}
          onClose={() => setShowSnapCamera(false)}
          sending={sending}
        />
      )}

      {/* Snap viewer overlay */}
      {viewingSnap && (
        <SnapViewer
          imageUrl={viewingSnap.imageUrl}
          senderName={viewingSnap.senderName}
          caption={viewingSnap.caption}
          duration={viewingSnap.duration}
          onClose={() => setViewingSnap(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-3">
        <button onClick={onBack} className="p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <img
          src={avatarUrl}
          alt={otherUser.display_name}
          className="h-9 w-9 rounded-full object-cover"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{otherUser.display_name}</p>
          <p className="text-xs text-muted-foreground">@{otherUser.username}</p>
        </div>
        <button
          onClick={() => setSnapMode(!snapMode)}
          className={`rounded-full p-2 transition-colors ${
            snapMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          <Flame className="h-4 w-4" />
        </button>
      </div>

      {/* Snap mode indicator */}
      {snapMode && (
        <div className="flex items-center justify-center gap-1.5 bg-primary/10 py-1.5 text-xs text-primary font-medium">
          <Flame className="h-3 w-3" />
          Snap Mode · Messages disappear after viewing
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scrollbar-hide">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isMine = msg.sender_id === user?.id;
            const isSnap = msg.is_snap;
            const snapViewed = msg.viewed;

            // Snap messages that have been viewed by non-sender - show "opened" state
            if (isSnap && snapViewed && !isMine) {
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-2.5">
                    <Flame className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Snap opened</span>
                  </div>
                </div>
              );
            }

            // Unopened snap from someone else - tappable
            if (isSnap && !snapViewed && !isMine) {
              return (
                <div key={msg.id} className={`flex justify-start`}>
                  <button
                    onClick={() => handleOpenSnap(msg)}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-4 py-3 animate-pulse"
                  >
                    <Flame className="h-5 w-5 text-primary-foreground" />
                    <span className="text-sm font-semibold text-primary-foreground">
                      Tap to view Snap
                    </span>
                  </button>
                </div>
              );
            }

            // Snap I sent
            if (isSnap && isMine) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="flex items-center gap-2 rounded-2xl bg-primary/20 border border-primary/30 px-4 py-2.5">
                    <Flame className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {snapViewed ? "Snap opened" : "Snap sent"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              );
            }

            // Regular message
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                    isMine
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.media_url && (
                    <div className="mb-2 overflow-hidden rounded-xl">
                      {msg.media_type === "video" ? (
                        <video
                          src={msg.media_url}
                          className="max-h-48 w-full rounded-xl object-cover"
                          controls
                          playsInline
                        />
                      ) : (
                        <img
                          src={msg.media_url}
                          alt=""
                          className="max-h-48 w-full rounded-xl object-cover"
                        />
                      )}
                    </div>
                  )}
                  {msg.content && (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                  <p
                    className={`mt-1 text-[10px] ${
                      isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <img
              src={avatarUrl}
              alt=""
              className="mb-3 h-16 w-16 rounded-full object-cover"
            />
            <p className="text-sm font-medium text-foreground">{otherUser.display_name}</p>
            <p className="mt-1 text-xs">Send a message to start chatting</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2 pb-safe">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleMedia}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSnapCamera(true)}
            className={`rounded-full p-2.5 ${
              snapMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Camera className="h-5 w-5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-secondary p-2.5 text-muted-foreground"
          >
            <Image className="h-5 w-5" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={snapMode ? "Send a Snap..." : "Message..."}
              className="w-full rounded-full bg-secondary px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Smile className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
