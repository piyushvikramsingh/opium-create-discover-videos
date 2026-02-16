import { useState } from "react";
import { MessageCircle, Search, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, useCreateConversation, useSearchUsers } from "@/hooks/useMessages";
import { useNavigate } from "react-router-dom";
import ChatView from "@/components/ChatView";

const Inbox = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useConversations();
  const createConversation = useCreateConversation();
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    otherUser: any;
  } | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: searchResults } = useSearchUsers(searchQuery);

  const handleStartChat = async (targetUser: any) => {
    try {
      const conversationId = await createConversation.mutateAsync(targetUser.user_id);
      setActiveConversation({ id: conversationId, otherUser: targetUser });
      setShowNewChat(false);
      setSearchQuery("");
    } catch (err: any) {
      console.error("Failed to start chat:", err);
    }
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

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 pb-20">
        <p className="text-muted-foreground mb-4">Sign in to view messages</p>
        <button
          onClick={() => navigate("/auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  // Active chat view
  if (activeConversation) {
    return (
      <div className="h-[100dvh] pb-16">
        <ChatView
          conversationId={activeConversation.id}
          otherUser={activeConversation.otherUser}
          onBack={() => setActiveConversation(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold text-foreground">Messages</h1>
        <button
          onClick={() => setShowNewChat(true)}
          className="rounded-full bg-primary p-2 text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button onClick={() => { setShowNewChat(false); setSearchQuery(""); }}>
              <X className="h-5 w-5 text-foreground" />
            </button>
            <h2 className="text-base font-semibold text-foreground">New Message</h2>
          </div>
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                  className="flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-secondary/50"
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
            ) : searchQuery.length >= 2 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users found</p>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Search for someone to message
              </p>
            )}
          </div>
        </div>
      )}

      {/* Conversations list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : conversations && conversations.length > 0 ? (
        <div>
          {conversations.map((convo: any) => {
            const other = convo.otherParticipants?.[0];
            if (!other) return null;
            const lastMsg = convo.lastMessage;
            const avatarUrl = other.avatar_url || `https://i.pravatar.cc/100?u=${other.user_id}`;

            let preview = "No messages yet";
            if (lastMsg) {
              if (lastMsg.is_snap) preview = "🔥 Snap";
              else if (lastMsg.media_type === "image") preview = "📷 Photo";
              else if (lastMsg.media_type === "video") preview = "🎥 Video";
              else if (lastMsg.content) preview = lastMsg.content;
            }

            return (
              <button
                key={convo.id}
                onClick={() => setActiveConversation({ id: convo.id, otherUser: other })}
                className="flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-secondary/50"
              >
                <div className="relative">
                  <img
                    src={avatarUrl}
                    alt={other.display_name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{other.display_name}</p>
                    {lastMsg && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
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
          <p className="text-sm font-semibold text-foreground">No messages yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap + to start a conversation
          </p>
        </div>
      )}
    </div>
  );
};

export default Inbox;
