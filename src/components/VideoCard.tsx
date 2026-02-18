import { Heart, MessageCircle, Share2, Bookmark, Music, Plus, Volume2, VolumeX } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToggleLike, useToggleBookmark } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import CommentsSheet from "@/components/CommentsSheet";

function formatCount(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

interface VideoCardProps {
  video: {
    id: string;
    description: string;
    music: string;
    thumbnail_url: string;
    video_url: string;
    likes_count: number;
    comments_count: number;
    shares_count: number;
    bookmarks_count: number;
    user_id: string;
    profiles?: {
      username: string;
      display_name: string;
      avatar_url: string;
    };
  };
  isLiked: boolean;
  isBookmarked: boolean;
  isNearActive: boolean;
}

const VideoCard = ({ video, isLiked, isBookmarked, isNearActive }: VideoCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLoadedMedia, setHasLoadedMedia] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isSpeedBoosted, setIsSpeedBoosted] = useState(false);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const longPressTimeoutRef = useRef<number | null>(null);
  const singleTapTimeoutRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);
  const isLongPressActiveRef = useRef(false);

  useEffect(() => {
    if (isNearActive) {
      setHasLoadedMedia(true);
    }
  }, [isNearActive]);

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        window.clearTimeout(longPressTimeoutRef.current);
      }
      if (singleTapTimeoutRef.current) {
        window.clearTimeout(singleTapTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !hasLoadedMedia) return;

    if (isNearActive) {
      vid.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
      return;
    }

    vid.pause();
    setIsPlaying(false);
  }, [isNearActive, hasLoadedMedia]);

  const handleLike = useCallback(() => {
    if (!user) { navigate("/auth"); return; }
    toggleLike.mutate({ videoId: video.id, isLiked });
  }, [user, navigate, toggleLike, video.id, isLiked]);

  const handleBookmark = useCallback(() => {
    if (!user) { navigate("/auth"); return; }
    toggleBookmark.mutate({ videoId: video.id, isBookmarked });
  }, [user, navigate, toggleBookmark, video.id, isBookmarked]);

  const resetSpeedBoost = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) {
      setIsSpeedBoosted(false);
      isLongPressActiveRef.current = false;
      return;
    }

    vid.playbackRate = 1;
    setIsSpeedBoosted(false);
    isLongPressActiveRef.current = false;
  }, []);

  const triggerLikeBurst = useCallback(() => {
    setShowLikeBurst(true);
    window.setTimeout(() => setShowLikeBurst(false), 620);
  }, []);

  const profile = video.profiles;
  const avatarUrl = profile?.avatar_url || `https://i.pravatar.cc/100?u=${video.user_id}`;

  const isVideo = !!video.video_url;
  const posterUrl = video.thumbnail_url && video.thumbnail_url.length > 0 ? video.thumbnail_url : undefined;

  const handleSingleTapAction = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (!hasLoadedMedia) {
      setHasLoadedMedia(true);
      return;
    }

    // First tap should reliably enable sound while keeping playback smooth.
    if (vid.muted) {
      vid.muted = false;
      setMuted(false);
      vid.play().then(() => setIsPlaying(true)).catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    if (vid.paused) {
      vid.play().then(() => setIsPlaying(true)).catch(() => {
        setIsPlaying(false);
      });
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  }, [hasLoadedMedia]);

  const startLongPress = useCallback(() => {
    if (!isVideo) return;
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
    }

    longPressTimeoutRef.current = window.setTimeout(() => {
      const vid = videoRef.current;
      if (!vid) return;

      isLongPressActiveRef.current = true;
      setIsSpeedBoosted(true);

      vid.playbackRate = 2;
      if (vid.paused) {
        vid.play().then(() => setIsPlaying(true)).catch(() => {
          setIsPlaying(false);
        });
      }
    }, 200);
  }, [isVideo]);

  const handleMediaPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startLongPress();
  }, [startLongPress]);

  const handleMediaPointerUp = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (isLongPressActiveRef.current) {
      resetSpeedBoost();
      return;
    }

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;
    const isDoubleTap = now - lastTapAtRef.current <= DOUBLE_TAP_DELAY;

    if (isDoubleTap) {
      lastTapAtRef.current = 0;
      if (singleTapTimeoutRef.current) {
        window.clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }

      if (!isLiked) {
        handleLike();
      }
      triggerLikeBurst();
      return;
    }

    lastTapAtRef.current = now;
    if (singleTapTimeoutRef.current) {
      window.clearTimeout(singleTapTimeoutRef.current);
    }

    singleTapTimeoutRef.current = window.setTimeout(() => {
      handleSingleTapAction();
      singleTapTimeoutRef.current = null;
    }, DOUBLE_TAP_DELAY);
  }, [handleLike, handleSingleTapAction, isLiked, resetSpeedBoost, triggerLikeBurst]);

  const handleMediaPointerCancel = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    resetSpeedBoost();
  }, [resetSpeedBoost]);

  return (
    <div className="snap-item feed-item relative w-full overflow-hidden bg-background">
      {isVideo && hasLoadedMedia ? (
        <video
          ref={videoRef}
          src={video.video_url}
          poster={posterUrl}
          className="feed-media absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          playsInline
          muted={muted}
          preload={isNearActive ? "metadata" : "none"}
          aria-label="video"
        />
      ) : (
        <img
          src={posterUrl || video.video_url}
          alt=""
          className="feed-media absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        className="absolute inset-0 z-[1]"
        onPointerDown={handleMediaPointerDown}
        onPointerUp={handleMediaPointerUp}
        onPointerCancel={handleMediaPointerCancel}
        onPointerLeave={handleMediaPointerCancel}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30 pointer-events-none" />

      {/* Mute toggle */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const next = !muted;
            setMuted(next);
            if (videoRef.current) videoRef.current.muted = next;
          }}
          className="lift-on-tap absolute right-3 top-16 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </button>
      )}

      {/* Muted indicator — like Instagram Reels */}
      {isVideo && muted && isPlaying && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <VolumeX className="h-6 w-6 text-white" />
          </div>
        </div>
      )}

      {/* 2x speed indicator while pressed */}
      {isVideo && isSpeedBoosted && (
        <div className="absolute left-1/2 top-[42%] z-10 -translate-x-1/2 pointer-events-none">
          <div className="rounded-full bg-black/50 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            2x
          </div>
        </div>
      )}

      {/* Double-tap like burst */}
      {showLikeBurst && (
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <Heart className="h-20 w-20 fill-primary text-primary animate-ping" />
        </div>
      )}

      {/* Right side actions */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-5">
        <div className="relative">
          <button onClick={() => navigate(`/profile/${video.user_id}`)} className="lift-on-tap block rounded-full">
            <img
              src={avatarUrl}
              alt={profile?.display_name || "user"}
              className="h-12 w-12 rounded-full border-2 border-foreground object-cover"
            />
          </button>
          <button className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary">
            <Plus className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>

        <button onClick={handleLike} className="lift-on-tap flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 transition-all ${isLiked ? "fill-primary text-primary scale-110" : "text-foreground"}`} />
          <span className="text-xs text-foreground font-medium">{formatCount(video.likes_count)}</span>
        </button>

        <button onClick={() => setShowComments(true)} className="lift-on-tap flex flex-col items-center gap-1">
          <MessageCircle className="h-7 w-7 text-foreground" />
          <span className="text-xs text-foreground font-medium">{formatCount(video.comments_count)}</span>
        </button>

        <button onClick={handleBookmark} className="lift-on-tap flex flex-col items-center gap-1">
          <Bookmark className={`h-7 w-7 transition-all ${isBookmarked ? "fill-primary text-primary scale-110" : "text-foreground"}`} />
          <span className="text-xs text-foreground font-medium">{formatCount(video.bookmarks_count)}</span>
        </button>

        <button className="lift-on-tap flex flex-col items-center gap-1">
          <Share2 className="h-7 w-7 text-foreground" />
          <span className="text-xs text-foreground font-medium">{formatCount(video.shares_count)}</span>
        </button>

        <div className={`mt-1 h-10 w-10 rounded-full border-2 border-muted bg-secondary overflow-hidden ${isNearActive ? "animate-spin-slow" : ""}`}>
          <img src={avatarUrl} alt="music" className="h-full w-full object-cover" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-20 z-10">
        <p className="text-base font-bold text-foreground">@{profile?.username || "user"}</p>
        <p className="mt-1 text-sm text-foreground/90 leading-snug line-clamp-2">{video.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <Music className="h-3.5 w-3.5 text-foreground" />
          <p className="text-xs text-foreground/80 truncate">{video.music || "original sound"}</p>
        </div>
      </div>

      <CommentsSheet videoId={video.id} open={showComments} onOpenChange={setShowComments} />
    </div>
  );
};

const areEqual = (prev: VideoCardProps, next: VideoCardProps) => {
  return (
    prev.isLiked === next.isLiked &&
    prev.isBookmarked === next.isBookmarked &&
    prev.isNearActive === next.isNearActive &&
    prev.video.id === next.video.id &&
    prev.video.description === next.video.description &&
    prev.video.music === next.video.music &&
    prev.video.thumbnail_url === next.video.thumbnail_url &&
    prev.video.video_url === next.video.video_url &&
    prev.video.likes_count === next.video.likes_count &&
    prev.video.comments_count === next.video.comments_count &&
    prev.video.shares_count === next.video.shares_count &&
    prev.video.bookmarks_count === next.video.bookmarks_count &&
    prev.video.user_id === next.video.user_id &&
    prev.video.profiles?.username === next.video.profiles?.username &&
    prev.video.profiles?.display_name === next.video.profiles?.display_name &&
    prev.video.profiles?.avatar_url === next.video.profiles?.avatar_url
  );
};

export default memo(VideoCard, areEqual);
