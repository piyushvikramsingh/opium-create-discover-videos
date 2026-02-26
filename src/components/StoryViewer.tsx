import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, MoreVertical, Send, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewStory, useReplyToStory, useStoryViewers, useStoryReplies } from "@/hooks/useStories";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  audience?: "followers" | "close_friends";
  caption?: string;
  duration: number;
  created_at: string;
  viewed?: boolean;
}

export interface StoryGroup {
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
    is_verified: boolean;
  };
  stories: Story[];
  hasUnviewed?: boolean;
  hasCloseFriendsStory?: boolean;
}

interface StoryViewerProps {
  storyGroups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
}

export const StoryViewer = ({
  storyGroups,
  initialGroupIndex,
  onClose,
}: StoryViewerProps) => {
  const quickReactions = ["❤️", "🔥", "😂", "😍", "👏"];
  const { user } = useAuth();
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showInsights, setShowInsights] = useState(false);

  const viewStory = useViewStory();
  const replyToStory = useReplyToStory();

  const currentGroup = storyGroups[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex];
  const isOwnStory = !!user && !!currentStory && currentStory.user_id === user.id;
  const { data: storyViewers = [] } = useStoryViewers(currentStory?.id || "");
  const { data: storyReplies = [] } = useStoryReplies(currentStory?.id || "");
  const duration = (currentStory?.duration || 5) * 1000;

  useEffect(() => {
    if (currentStory && !currentStory.viewed && !isOwnStory) {
      viewStory.mutate(currentStory.id);
    }
  }, [currentStory, isOwnStory, viewStory]);

  useEffect(() => {
    setShowInsights(false);
  }, [currentStory?.id]);

  const handleNext = useCallback(() => {
    if (!currentGroup) return;

    if (currentStoryIndex < currentGroup.stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
      setProgress(0);
    } else if (currentGroupIndex < storyGroups.length - 1) {
      setCurrentGroupIndex(currentGroupIndex + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentGroup, currentGroupIndex, currentStoryIndex, onClose, storyGroups.length]);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + (100 / (duration / 100));
        if (newProgress >= 100) {
          handleNext();
          return 0;
        }
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPaused, duration, handleNext]);

  const handlePrev = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
      setProgress(0);
    } else if (currentGroupIndex > 0) {
      setCurrentGroupIndex(currentGroupIndex - 1);
      const prevGroup = storyGroups[currentGroupIndex - 1];
      setCurrentStoryIndex(prevGroup.stories.length - 1);
      setProgress(0);
    }
  };

  const sendReply = (message: string) => {
    if (!message.trim() || !currentStory) return;

    replyToStory.mutate({
      story_id: currentStory.id,
      message,
    });
    setReplyText("");
  };

  const handleReply = () => {
    sendReply(replyText);
  };

  const handleQuickReaction = (emoji: string) => {
    sendReply(emoji);
  };

  if (!currentGroup || !currentStory) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Story header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4">
        {/* Progress bars */}
        <div className="flex gap-1 mb-3">
          {currentGroup.stories.map((_, index) => (
            <div
              key={index}
              className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-white transition-all duration-100"
                style={{
                  width:
                    index < currentStoryIndex
                      ? "100%"
                      : index === currentStoryIndex
                        ? `${progress}%`
                        : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* User info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border-2 border-white">
              <AvatarImage src={currentGroup.user.avatar_url} />
              <AvatarFallback>
                {currentGroup.user.display_name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-semibold text-sm">
                  {currentGroup.user.username}
                </span>
                {currentGroup.user.is_verified && (
                  <svg
                    className="w-3.5 h-3.5 text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                )}
              </div>
              <span className="text-white/70 text-xs">
                {getRelativeTime(currentStory.created_at)}
              </span>
              {currentStory.audience === "close_friends" && (
                <span className="inline-block rounded-full border border-emerald-300/50 bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  Close friends
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? "▶" : "⏸"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Story content */}
      <div
        className="w-full h-full flex items-center justify-center"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Navigate areas */}
        <button
          onClick={handlePrev}
          className="absolute left-0 top-0 bottom-0 w-1/3 z-10 cursor-pointer"
        />
        <button
          onClick={handleNext}
          className="absolute right-0 top-0 bottom-0 w-1/3 z-10 cursor-pointer"
        />

        {currentStory.media_type === "image" ? (
          <img
            src={currentStory.media_url}
            alt="Story"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            src={currentStory.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            playsInline
          />
        )}

        {currentStory.caption && (
          <div className="absolute bottom-20 left-4 right-4 text-white text-sm">
            {currentStory.caption}
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
        {isOwnStory ? (
          <div className="rounded-xl border border-white/20 bg-black/40 p-3">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowInsights((prev) => !prev)}
            >
              <div className="flex items-center gap-2 text-white">
                <Eye className="h-4 w-4" />
                <span className="text-sm font-medium">{storyViewers.length} views</span>
                <span className="text-white/60">•</span>
                <span className="text-sm font-medium">{storyReplies.length} replies</span>
              </div>
              <span className="text-xs text-white/70">{showInsights ? "Hide" : "View"}</span>
            </button>

            {showInsights && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/70">Viewers</p>
                  <div className="space-y-1.5">
                    {storyViewers.slice(0, 4).map((viewer: any) => (
                      <p key={viewer.id} className="text-sm text-white">
                        {viewer.profiles?.username || "unknown"}
                      </p>
                    ))}
                    {storyViewers.length === 0 && <p className="text-sm text-white/70">No viewers yet</p>}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/70">Replies</p>
                  <div className="space-y-1.5">
                    {storyReplies.slice(0, 4).map((reply: any) => (
                      <p key={reply.id} className="text-sm text-white">
                        <span className="text-white/70">{reply.sender_profile?.username || "unknown"}:</span>{" "}
                        {reply.message}
                      </p>
                    ))}
                    {storyReplies.length === 0 && <p className="text-sm text-white/70">No replies yet</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              {quickReactions.map((emoji) => (
                <Button
                  key={emoji}
                  size="sm"
                  variant="ghost"
                  className="h-9 min-w-9 px-2 text-lg text-white hover:bg-white/10"
                  onClick={() => handleQuickReaction(emoji)}
                >
                  {emoji}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${currentGroup.user.username}...`}
                className="flex-1 bg-transparent border-white/30 text-white placeholder:text-white/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReply();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={handleReply}
                disabled={!replyText.trim()}
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Navigation arrows (desktop) */}
      <div className="hidden md:block">
        {currentGroupIndex > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
            onClick={() => {
              setCurrentGroupIndex(currentGroupIndex - 1);
              setCurrentStoryIndex(0);
              setProgress(0);
            }}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        )}
        {currentGroupIndex < storyGroups.length - 1 && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
            onClick={() => {
              setCurrentGroupIndex(currentGroupIndex + 1);
              setCurrentStoryIndex(0);
              setProgress(0);
            }}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        )}
      </div>
    </div>
  );
};

function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
