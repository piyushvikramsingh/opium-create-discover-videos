import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, MoreVertical, Send, Eye, Bookmark, Plus, Heart, Share2, Volume2, VolumeX, Pause, Play, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewStory, useReplyToStory, useDeleteStory, useStoryViewers, useStoryReplies } from "@/hooks/useStories";
import { usePollResults, useQuizResults, useEmojiSliderAverage, useQuestionResponses } from "@/hooks/useStoryStickers";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useStoryStickers } from "@/hooks/useStoryStickers";
import { InteractiveSticker } from "@/components/InteractiveStickers";
import { useProfileHighlights, useAddStoryToHighlight, useCreateHighlight } from "@/hooks/useData";
import StickerEngagementInsights from "@/components/StickerEngagementInsights";
import { toast } from "sonner";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

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
  initialStoryIndex?: number;
  onClose: () => void;
}

export const StoryViewer = ({
  storyGroups,
  initialGroupIndex,
  initialStoryIndex = 0,
  onClose,
}: StoryViewerProps) => {
  const quickReactions = ["❤️", "🔥", "😂", "😮", "😢", "👏"];
  const { user } = useAuth();
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(initialStoryIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showInsights, setShowInsights] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [newHighlightName, setNewHighlightName] = useState("");
  const [resolvedDurationMs, setResolvedDurationMs] = useState(5000);
  const [isMuted, setIsMuted] = useState(true);
  const [showReactionBurst, setShowReactionBurst] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const viewStory = useViewStory();
  const replyToStory = useReplyToStory();
  const deleteStory = useDeleteStory();
  const addStoryToHighlight = useAddStoryToHighlight();
  const createHighlight = useCreateHighlight();

  const currentGroup = storyGroups[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex];
  const isOwnStory = !!user && !!currentStory && currentStory.user_id === user.id;
  const { data: storyViewers = [] } = useStoryViewers(currentStory?.id || "");
  const { data: storyReplies = [] } = useStoryReplies(currentStory?.id || "");
  const { data: storyStickers = [] } = useStoryStickers(currentStory?.id || "");
  const { data: myHighlights = [] } = useProfileHighlights(isOwnStory ? user?.id : undefined);

  const getFirstUnviewedIndex = useCallback((group?: StoryGroup) => {
    if (!group?.stories?.length) return 0;
    const index = group.stories.findIndex((s) => !s.viewed);
    return index >= 0 ? index : 0;
  }, []);

  // Duration resolver
  useEffect(() => {
    if (!currentStory) return;
    setResolvedDurationMs(Math.max(1000, (currentStory.duration || 5) * 1000));
  }, [currentStory?.id]);

  // Mark viewed
  useEffect(() => {
    if (currentStory && !currentStory.viewed && !isOwnStory) {
      viewStory.mutate(currentStory.id);
    }
  }, [currentStory?.id]);

  useEffect(() => {
    setShowInsights(false);
    setShowMoreMenu(false);
    setShowHighlightPicker(false);
  }, [currentStory?.id]);

  const handleNext = useCallback(() => {
    if (!currentGroup) return;
    if (currentStoryIndex < currentGroup.stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
      setProgress(0);
    } else if (currentGroupIndex < storyGroups.length - 1) {
      const next = currentGroupIndex + 1;
      setCurrentGroupIndex(next);
      setCurrentStoryIndex(getFirstUnviewedIndex(storyGroups[next]));
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentGroup, currentGroupIndex, currentStoryIndex, getFirstUnviewedIndex, onClose, storyGroups]);

  const handlePrev = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
      setProgress(0);
    } else if (currentGroupIndex > 0) {
      const prev = currentGroupIndex - 1;
      setCurrentGroupIndex(prev);
      setCurrentStoryIndex(Math.max(0, storyGroups[prev].stories.length - 1));
      setProgress(0);
    }
  }, [currentGroupIndex, currentStoryIndex, storyGroups]);

  // Progress timer
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 / (resolvedDurationMs / 50));
        if (next >= 100) {
          handleNext();
          return 0;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isPaused, resolvedDurationMs, handleNext]);

  // Video sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || currentStory?.media_type !== "video") return;
    video.muted = isMuted;
    if (isPaused) { video.pause(); return; }
    video.play().catch(() => {});
  }, [isPaused, currentStory?.id, currentStory?.media_type, isMuted]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
      if (e.key === " ") { e.preventDefault(); setIsPaused((p) => !p); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  // Swipe gestures
  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 80;
    if (info.offset.x < -threshold) {
      // Swipe left → next group
      if (currentGroupIndex < storyGroups.length - 1) {
        setSwipeDirection("left");
        const next = currentGroupIndex + 1;
        setCurrentGroupIndex(next);
        setCurrentStoryIndex(getFirstUnviewedIndex(storyGroups[next]));
        setProgress(0);
      }
    } else if (info.offset.x > threshold) {
      // Swipe right → prev group
      if (currentGroupIndex > 0) {
        setSwipeDirection("right");
        const prev = currentGroupIndex - 1;
        setCurrentGroupIndex(prev);
        setCurrentStoryIndex(getFirstUnviewedIndex(storyGroups[prev]));
        setProgress(0);
      }
    }
    // Swipe down to close
    if (info.offset.y > 120) {
      onClose();
    }
  };

  // Touch handlers for hold-to-pause
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setIsPaused(true), 200);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    setIsPaused(false);
  };

  const sendReply = (msg: string) => {
    if (!msg.trim() || !currentStory) return;
    replyToStory.mutate({ story_id: currentStory.id, message: msg });
    setReplyText("");
  };

  const handleQuickReaction = (emoji: string) => {
    sendReply(emoji);
    setShowReactionBurst(emoji);
    setTimeout(() => setShowReactionBurst(null), 1200);
  };

  const handleDeleteStory = () => {
    if (!currentStory) return;
    deleteStory.mutate(currentStory.id);
    handleNext();
    setShowMoreMenu(false);
  };

  if (!currentGroup || !currentStory) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Desktop side previews */}
      <div className="hidden md:flex items-center gap-4 absolute inset-0 justify-center">
        {/* Previous group preview */}
        {currentGroupIndex > 0 && (
          <button
            onClick={() => {
              const prev = currentGroupIndex - 1;
              setCurrentGroupIndex(prev);
              setCurrentStoryIndex(getFirstUnviewedIndex(storyGroups[prev]));
              setProgress(0);
            }}
            className="w-16 h-[28vh] rounded-xl bg-white/5 overflow-hidden opacity-40 hover:opacity-60 transition-opacity hidden lg:block"
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={storyGroups[currentGroupIndex - 1]?.user?.avatar_url} />
                <AvatarFallback className="text-[10px]">
                  {storyGroups[currentGroupIndex - 1]?.user?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </button>
        )}

        {/* Main story card */}
        <motion.div
          key={`${currentGroupIndex}-${currentStoryIndex}`}
          className="relative w-full max-w-[420px] h-full md:h-[85vh] md:rounded-2xl overflow-hidden bg-black"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
        >
          {/* Close friends green top bar */}
          {currentStory.audience === "close_friends" && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-green-600 z-30" />
          )}

          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 z-30 px-2 pt-2">
            <div className="flex gap-1">
              {currentGroup.stories.map((_, index) => (
                <div key={index} className="h-[3px] flex-1 bg-white/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white rounded-full"
                    style={{
                      width: index < currentStoryIndex ? "100%" : index === currentStoryIndex ? `${progress}%` : "0%",
                    }}
                    transition={{ duration: 0.05, ease: "linear" }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* User header */}
          <div className="absolute top-5 left-0 right-0 z-30 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`rounded-full p-[2px] ${
                  currentStory.audience === "close_friends"
                    ? "bg-gradient-to-br from-green-400 to-green-600"
                    : "bg-transparent"
                }`}>
                  <Avatar className="w-9 h-9 border-2 border-black">
                    <AvatarImage src={currentGroup.user.avatar_url} />
                    <AvatarFallback className="text-xs">{currentGroup.user.display_name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-semibold text-[13px]">{currentGroup.user.username}</span>
                  {currentGroup.user.is_verified && (
                    <svg className="w-3.5 h-3.5 text-[#0095F6]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  )}
                  <span className="text-white/60 text-xs">{getRelativeTime(currentStory.created_at)}</span>
                  {currentStory.audience === "close_friends" && (
                    <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-300 border border-green-500/30">
                      ★ Close Friends
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                {currentStory.media_type === "video" && (
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="ig-overlay-btn"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
                  </button>
                )}
                <button
                  onClick={() => { setIsPaused((p) => !p); }}
                  className="ig-overlay-btn"
                  aria-label={isPaused ? "Play" : "Pause"}
                >
                  {isPaused ? <Play className="w-[18px] h-[18px]" /> : <Pause className="w-[18px] h-[18px]" />}
                </button>
                <button
                  onClick={() => { setShowMoreMenu(!showMoreMenu); setIsPaused(true); }}
                  className="ig-overlay-btn"
                  aria-label="More options"
                >
                  <MoreVertical className="w-[18px] h-[18px]" />
                </button>
                <button onClick={onClose} className="ig-overlay-btn" aria-label="Close">
                  <X className="w-[20px] h-[20px]" />
                </button>
              </div>
            </div>
          </div>

          {/* More menu dropdown */}
          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-[72px] right-3 z-40 w-52 rounded-xl border border-white/10 bg-[#262626] shadow-2xl overflow-hidden"
              >
                {isOwnStory && (
                  <>
                    <button
                      onClick={() => { setShowHighlightPicker(true); setShowMoreMenu(false); }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <Bookmark className="w-4 h-4" /> Add to Highlight
                    </button>
                    <button
                      onClick={handleDeleteStory}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Story
                    </button>
                  </>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); setShowMoreMenu(false); setIsPaused(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                >
                  <Share2 className="w-4 h-4" /> Copy Link
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Highlight picker */}
          <AnimatePresence>
            {showHighlightPicker && isOwnStory && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                className="absolute bottom-0 left-0 right-0 z-40 rounded-t-2xl bg-[#262626] p-4 pb-safe max-h-[50vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold text-base">Add to Highlight</h3>
                  <button onClick={() => { setShowHighlightPicker(false); setIsPaused(false); }} className="text-white/60">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(myHighlights as any[]).map((h: any) => (
                    <button
                      key={h.id}
                      onClick={async () => {
                        try {
                          await addStoryToHighlight.mutateAsync({ highlightId: h.id, storyId: currentStory.id });
                          toast.success(`Added to "${h.title}"`);
                          setShowHighlightPicker(false);
                          setIsPaused(false);
                        } catch { toast.error("Failed"); }
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/20">
                        {h.cover_url ? (
                          <img src={h.cover_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <Bookmark className="w-5 h-5 text-white/50" />
                        )}
                      </div>
                      <span className="text-white text-[11px] truncate max-w-full">{h.title}</span>
                    </button>
                  ))}
                  {/* New highlight */}
                  <div className="flex flex-col items-center gap-2 p-3">
                    <button
                      onClick={() => {
                        const name = prompt("Highlight name:");
                        if (!name?.trim()) return;
                        createHighlight.mutateAsync({ title: name.trim() }).then((r: any) => {
                          if (r?.id) addStoryToHighlight.mutateAsync({ highlightId: r.id, storyId: currentStory.id });
                          toast.success(`Created "${name.trim()}"`);
                          setShowHighlightPicker(false);
                          setIsPaused(false);
                        }).catch(() => toast.error("Failed"));
                      }}
                      className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border-2 border-dashed border-white/30"
                    >
                      <Plus className="w-6 h-6 text-white/60" />
                    </button>
                    <span className="text-white/60 text-[11px]">New</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Story media */}
          <div
            className="w-full h-full flex items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
          >
            {/* Left/right tap zones */}
            <button onClick={handlePrev} className="absolute left-0 top-20 bottom-24 w-1/3 z-20" />
            <button onClick={handleNext} className="absolute right-0 top-20 bottom-24 w-1/3 z-20" />

            {currentStory.media_type === "image" ? (
              <motion.img
                key={currentStory.id}
                src={currentStory.media_url}
                alt="Story"
                className="w-full h-full object-cover"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              />
            ) : (
              <motion.video
                key={currentStory.id}
                ref={videoRef}
                src={currentStory.media_url}
                className="w-full h-full object-cover"
                autoPlay
                muted={isMuted}
                playsInline
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onLoadedMetadata={(e) => {
                  const dur = Number((e.target as HTMLVideoElement).duration || currentStory.duration || 5);
                  if (Number.isFinite(dur) && dur > 0) setResolvedDurationMs(Math.max(1000, dur * 1000));
                }}
              />
            )}

            {/* Center pause indicator */}
            <AnimatePresence>
              {isPaused && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
                >
                  <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <Pause className="w-7 h-7 text-white" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reaction burst animation */}
            <AnimatePresence>
              {showReactionBurst && (
                <motion.div
                  key={showReactionBurst}
                  initial={{ opacity: 1, scale: 0.5, y: 0 }}
                  animate={{ opacity: 0, scale: 3, y: -200 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 text-6xl pointer-events-none"
                >
                  {showReactionBurst}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Caption */}
            {currentStory.caption && (
              <div className="absolute bottom-24 left-0 right-0 px-4 z-20">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black/30 backdrop-blur-sm rounded-xl px-4 py-2.5"
                >
                  <p className="text-white text-sm">{currentStory.caption}</p>
                </motion.div>
              </div>
            )}

            {/* Stickers overlay */}
            {storyStickers.length > 0 && (
              <div className="absolute inset-0 z-[15] pointer-events-none">
                {storyStickers.map((sticker) => (
                  <div
                    key={sticker.id}
                    className="absolute pointer-events-auto"
                    style={{
                      left: `${(sticker.position_x ?? 50)}%`,
                      top: `${(sticker.position_y ?? 50)}%`,
                      transform: `translate(-50%, -50%) rotate(${sticker.rotation ?? 0}deg) scale(${sticker.scale ?? 1})`,
                    }}
                  >
                    <InteractiveSticker sticker={sticker} storyId={currentStory.id} isOwner={isOwnStory} />
                  </div>
                ))}
              </div>
            )}

            {/* Gradient overlays */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
          </div>

          {/* Bottom area: reply or insights */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe z-30">
            {isOwnStory ? (
              /* Owner insights bar */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-white/10 backdrop-blur-sm py-3 text-white"
                  onClick={() => setShowInsights(!showInsights)}
                >
                  <Eye className="h-4 w-4" />
                  <span className="text-sm font-medium">{storyViewers.length}</span>
                </button>

                <AnimatePresence>
                  {showInsights && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 overflow-hidden"
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1.5 text-xs font-semibold text-white/60 uppercase tracking-wider">Viewers</p>
                          <div className="space-y-2">
                            {storyViewers.slice(0, 6).map((v: any) => (
                              <div key={v.id} className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={v.profiles?.avatar_url} />
                                  <AvatarFallback className="text-[8px]">{v.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-white">{v.profiles?.username || "unknown"}</span>
                              </div>
                            ))}
                            {storyViewers.length === 0 && <p className="text-xs text-white/50">No viewers yet</p>}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-semibold text-white/60 uppercase tracking-wider">Replies</p>
                          <div className="space-y-2">
                            {storyReplies.slice(0, 4).map((r: any) => (
                              <p key={r.id} className="text-xs text-white">
                                <span className="text-white/50">{r.sender_profile?.username}:</span> {r.message}
                              </p>
                            ))}
                            {storyReplies.length === 0 && <p className="text-xs text-white/50">No replies yet</p>}
                          </div>
                        </div>
                      </div>
                      <StickerEngagementInsights stickers={storyStickers} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              /* Viewer reply area */
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Quick reactions */}
                <div className="flex items-center justify-center gap-3 mb-3">
                  {quickReactions.map((emoji) => (
                    <motion.button
                      key={emoji}
                      whileTap={{ scale: 1.5 }}
                      onClick={() => handleQuickReaction(emoji)}
                      className="text-2xl hover:scale-110 transition-transform"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
                {/* Reply input — IG style: input + heart + share */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Input
                      ref={replyInputRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply to ${currentGroup.user.username}...`}
                      className="w-full bg-transparent border border-white/40 text-white placeholder:text-white/60 rounded-full h-11 px-4 backdrop-blur-sm focus-visible:ring-0 focus-visible:border-white"
                      onFocus={() => setIsPaused(true)}
                      onBlur={() => { if (!replyText) setIsPaused(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { sendReply(replyText); setIsPaused(false); } }}
                    />
                  </div>
                  {replyText.trim() ? (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { sendReply(replyText); setIsPaused(false); }}
                      className="h-11 px-4 rounded-full text-white font-semibold text-sm bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] via-[#d62976] to-[#962fbf]"
                    >
                      Send
                    </motion.button>
                  ) : (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => handleQuickReaction("❤️")}
                        className="h-11 w-11 flex items-center justify-center text-white"
                        aria-label="Like story"
                      >
                        <Heart className="w-7 h-7" strokeWidth={2} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }}
                        className="h-11 w-11 flex items-center justify-center text-white"
                        aria-label="Share story"
                      >
                        <Send className="w-6 h-6" strokeWidth={2} />
                      </motion.button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Next group preview */}
        {currentGroupIndex < storyGroups.length - 1 && (
          <button
            onClick={() => {
              const next = currentGroupIndex + 1;
              setCurrentGroupIndex(next);
              setCurrentStoryIndex(getFirstUnviewedIndex(storyGroups[next]));
              setProgress(0);
            }}
            className="w-16 h-[28vh] rounded-xl bg-white/5 overflow-hidden opacity-40 hover:opacity-60 transition-opacity hidden lg:block"
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={storyGroups[currentGroupIndex + 1]?.user?.avatar_url} />
                <AvatarFallback className="text-[10px]">
                  {storyGroups[currentGroupIndex + 1]?.user?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </button>
        )}
      </div>
    </motion.div>
  );
};

function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
