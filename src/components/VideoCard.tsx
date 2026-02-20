import { Heart, MessageCircle, Share2, Bookmark, Music, Plus, Volume2, VolumeX, MoreHorizontal, Flag, EyeOff, UserX, BellOff, Sparkles, Flame } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToggleLike, useToggleBookmark, useTrackVideoEvent, useShareVideo, useHideVideo, useUnhideVideo, useBlockUser, useMuteUser, useReportVideo, useToggleFollow } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import CommentsSheet from "@/components/CommentsSheet";
import { toast } from "sonner";
import Hls from "hls.js";

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
  isActive: boolean;
  isNearActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

const VideoCard = ({ video, isLiked, isBookmarked, isActive, isNearActive, isMuted, onToggleMute }: VideoCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toggleFollow = useToggleFollow();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const trackEvent = useTrackVideoEvent();
  const shareVideo = useShareVideo();
  const hideVideo = useHideVideo();
  const unhideVideo = useUnhideVideo();
  const blockUser = useBlockUser();
  const muteUser = useMuteUser();
  const reportVideo = useReportVideo();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLoadedMedia, setHasLoadedMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showFollowPrompt, setShowFollowPrompt] = useState(false);
  const [showMoreLikeChip, setShowMoreLikeChip] = useState(false);
  const [sessionStreakCount, setSessionStreakCount] = useState(0);
  const [isSpeedBoosted, setIsSpeedBoosted] = useState(false);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const longPressTimeoutRef = useRef<number | null>(null);
  const singleTapTimeoutRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const activatePlayTimeoutRef = useRef<number | null>(null);
  const waitingTimeoutRef = useRef<number | null>(null);
  const isActiveRef = useRef(isActive);
  const hasLoadedMediaRef = useRef(hasLoadedMedia);
  const lastTapAtRef = useRef(0);
  const isLongPressActiveRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const retryCountRef = useRef(0);
  const watchStartAtRef = useRef<number | null>(null);
  const tracked3sRef = useRef(false);
  const trackedCompleteRef = useRef(false);

  const discoveryTopic = useMemo(() => {
    const match = (video.description || "").match(/#([a-zA-Z0-9_]+)/);
    if (match?.[1]) return match[1];

    const music = (video.music || "").trim();
    if (!music) return "trending";

    return music.split(/[\s|,-]/).filter(Boolean)[0] || "trending";
  }, [video.description, video.music]);

  const socialProofLabel = useMemo(() => {
    if ((video.likes_count || 0) > 25000 || (video.shares_count || 0) > 4000) {
      return "Exploding now";
    }
    if ((video.shares_count || 0) > 1000) {
      return "People keep sharing this";
    }
    if ((video.comments_count || 0) > 500) {
      return "Hot discussion";
    }
    return "Trending in your feed";
  }, [video.comments_count, video.likes_count, video.shares_count]);

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
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
      if (activatePlayTimeoutRef.current) {
        window.clearTimeout(activatePlayTimeoutRef.current);
      }
      if (waitingTimeoutRef.current) {
        window.clearTimeout(waitingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const current = Number(window.sessionStorage.getItem("opium_session_view_complete_count") || "0");
    setSessionStreakCount(Number.isFinite(current) ? current : 0);
  }, []);

  const safePlay = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || mediaError) return;

    try {
      await vid.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [mediaError]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    hasLoadedMediaRef.current = hasLoadedMedia;
  }, [hasLoadedMedia]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !hasLoadedMedia) return;

    if (isActive) {
      if (activatePlayTimeoutRef.current) {
        window.clearTimeout(activatePlayTimeoutRef.current);
      }

      const canLikelyPlayImmediately = vid.readyState >= 2;
      if (canLikelyPlayImmediately) {
        safePlay();
      } else {
        activatePlayTimeoutRef.current = window.setTimeout(() => {
          if (!isActiveRef.current || !hasLoadedMediaRef.current) {
            activatePlayTimeoutRef.current = null;
            return;
          }
          safePlay();
          activatePlayTimeoutRef.current = null;
        }, 80);
      }
      return;
    }

    if (activatePlayTimeoutRef.current) {
      window.clearTimeout(activatePlayTimeoutRef.current);
      activatePlayTimeoutRef.current = null;
    }

    vid.pause();
    vid.playbackRate = 1;
    setIsPlaying(false);
    setIsSpeedBoosted(false);
  }, [isActive, hasLoadedMedia, safePlay]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const vid = videoRef.current;
      if (!vid) return;

      if (document.hidden) {
        vid.pause();
        setIsPlaying(false);
        return;
      }

      if (isActive && hasLoadedMedia && !mediaError) {
        safePlay();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [hasLoadedMedia, isActive, mediaError, safePlay]);

  useEffect(() => {
    if (!isActive) {
      if (watchStartAtRef.current && user) {
        const watchMs = Date.now() - watchStartAtRef.current;
        if (watchMs > 500) {
          trackEvent.mutate({ videoId: video.id, eventType: "view_start", watchMs });
        }
      }
      watchStartAtRef.current = null;
      return;
    }

    watchStartAtRef.current = Date.now();
    tracked3sRef.current = false;
    trackedCompleteRef.current = false;
    if (user) {
      trackEvent.mutate({ videoId: video.id, eventType: "view_start" });
    }

    return () => {
      if (watchStartAtRef.current && user) {
        const watchMs = Date.now() - watchStartAtRef.current;
        if (watchMs > 500) {
          trackEvent.mutate({ videoId: video.id, eventType: "view_start", watchMs });
        }
      }
      watchStartAtRef.current = null;
    };
  }, [isActive, trackEvent, user, video.id]);

  const handleLike = useCallback(() => {
    if (!user) { navigate("/auth"); return; }
    toggleLike.mutate({ videoId: video.id, isLiked });
    if (!isLiked) {
      trackEvent.mutate({ videoId: video.id, eventType: "like" });
      if (video.user_id !== user.id) {
        setShowFollowPrompt(true);
        window.setTimeout(() => setShowFollowPrompt(false), 4500);
      }
    }
  }, [user, navigate, toggleLike, video.id, isLiked, trackEvent, video.user_id]);

  const profile = video.profiles;
  const avatarUrl = profile?.avatar_url || `https://i.pravatar.cc/100?u=${video.user_id}`;

  const handleQuickFollow = useCallback(async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (video.user_id === user.id) {
      setShowFollowPrompt(false);
      return;
    }

    try {
      await toggleFollow.mutateAsync({
        targetUserId: video.user_id,
        isFollowing: false,
        targetIsPrivate: false,
        hasPendingRequest: false,
      });
      trackEvent.mutate({ videoId: video.id, eventType: "follow" });
      toast.success(`Following @${profile?.username || "creator"}`);
      setShowFollowPrompt(false);
    } catch {
      toast.message("Already following or unable to follow right now");
      setShowFollowPrompt(false);
    }
  }, [navigate, profile?.username, toggleFollow, trackEvent, user, video.id, video.user_id]);

  const handleBookmark = useCallback(() => {
    if (!user) { navigate("/auth"); return; }
    toggleBookmark.mutate({ videoId: video.id, isBookmarked });
  }, [user, navigate, toggleBookmark, video.id, isBookmarked]);

  const handleShare = useCallback(async () => {
    const link = `${window.location.origin}/profile/${video.user_id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `@${profile?.username || "user"} on Opium`,
          text: video.description || "Check out this video",
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
        toast.success("Link copied");
      }
      shareVideo.mutate({ videoId: video.id });
      if (user) {
        trackEvent.mutate({ videoId: video.id, eventType: "share" });
      }
    } catch {
      // user cancelled share
    }
  }, [profile?.username, shareVideo, trackEvent, user, video.description, video.id, video.user_id]);

  const handleHide = useCallback(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    hideVideo.mutate(
      { videoId: video.id },
      {
        onSuccess: () => {
          trackEvent.mutate({ videoId: video.id, eventType: "hide" });
          toast.success("Video hidden", {
            action: {
              label: "Undo",
              onClick: () => {
                unhideVideo.mutate(
                  { videoId: video.id },
                  {
                    onSuccess: () => {
                      toast.success("Video restored");
                    },
                  },
                );
              },
            },
          });
          setShowSafetyMenu(false);
        },
      },
    );
  }, [hideVideo, navigate, trackEvent, unhideVideo, user, video.id]);

  const handleBlock = useCallback(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    blockUser.mutate(
      { targetUserId: video.user_id },
      {
        onSuccess: () => {
          toast.success("User blocked");
          setShowSafetyMenu(false);
        },
      },
    );
  }, [blockUser, navigate, user, video.user_id]);

  const handleMute = useCallback(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    muteUser.mutate(
      { targetUserId: video.user_id },
      {
        onSuccess: () => {
          toast.success("User muted");
          setShowSafetyMenu(false);
        },
      },
    );
  }, [muteUser, navigate, user, video.user_id]);

  const handleReport = useCallback(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    const reason = window.prompt("Report reason (spam, abuse, misinformation, nudity, other):", "spam");
    if (!reason) return;

    reportVideo.mutate(
      { videoId: video.id, reason: reason.trim() },
      {
        onSuccess: () => {
          trackEvent.mutate({ videoId: video.id, eventType: "report" });
          toast.success("Report submitted");
          setShowSafetyMenu(false);
        },
      },
    );
  }, [navigate, reportVideo, trackEvent, user, video.id]);

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

  const isVideo = !!video.video_url;
  const isHlsSource = /\.m3u8(?:$|\?)/i.test(video.video_url || "");
  const posterUrl = video.thumbnail_url && video.thumbnail_url.length > 0 ? video.thumbnail_url : undefined;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isVideo || !hasLoadedMedia) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isHlsSource) {
      if (vid.src !== video.video_url) {
        vid.src = video.video_url;
      }
      return;
    }

    if (vid.canPlayType("application/vnd.apple.mpegurl")) {
      if (vid.src !== video.video_url) {
        vid.src = video.video_url;
      }
      return;
    }

    if (!Hls.isSupported()) {
      if (vid.src !== video.video_url) {
        vid.src = video.video_url;
      }
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 18,
      backBufferLength: 8,
      maxMaxBufferLength: 30,
    });

    hls.loadSource(video.video_url);
    hls.attachMedia(vid);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }

      hls.destroy();
      hlsRef.current = null;
    });

    hlsRef.current = hls;

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hasLoadedMedia, isHlsSource, isVideo, video.video_url]);

  const handleSingleTapAction = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (!hasLoadedMedia) {
      setHasLoadedMedia(true);
    }

    onToggleMute();

    if (vid.paused && isActive) {
      safePlay();
    }
  }, [hasLoadedMedia, isActive, onToggleMute, safePlay]);

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
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
    startLongPress();
  }, [startLongPress]);

  const handleMediaPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || pointerMovedRef.current) return;

    const dx = Math.abs(event.clientX - pointerStartRef.current.x);
    const dy = Math.abs(event.clientY - pointerStartRef.current.y);
    if (dx > 10 || dy > 10) {
      pointerMovedRef.current = true;
      if (longPressTimeoutRef.current) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    }
  }, []);

  const handleMediaPointerUp = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (pointerMovedRef.current) {
      resetSpeedBoost();
      pointerStartRef.current = null;
      pointerMovedRef.current = false;
      return;
    }

    if (isLongPressActiveRef.current) {
      resetSpeedBoost();
      pointerStartRef.current = null;
      pointerMovedRef.current = false;
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
    pointerStartRef.current = null;
    pointerMovedRef.current = false;
  }, [handleLike, handleSingleTapAction, isLiked, resetSpeedBoost, triggerLikeBurst]);

  const handleMediaPointerCancel = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    pointerStartRef.current = null;
    pointerMovedRef.current = false;
    resetSpeedBoost();
  }, [resetSpeedBoost]);

  const retryPlayback = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setMediaError(null);
    setRetryToken((prev) => prev + 1);
    retryCountRef.current = 0;
  }, []);

  const handleVideoError = useCallback(() => {
    const vid = videoRef.current;
    const message = vid?.error?.message || "Video failed to load";

    setIsPlaying(false);

    const nextRetry = retryCountRef.current + 1;
    retryCountRef.current = nextRetry;

    if (nextRetry <= 2) {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }

      retryTimeoutRef.current = window.setTimeout(() => {
        setRetryToken((prev) => prev + 1);
      }, 350 * nextRetry);
      return;
    }

    setMediaError(message);
  }, []);

  const handleCanPlay = useCallback(() => {
    retryCountRef.current = 0;
    setMediaError(null);
    if (waitingTimeoutRef.current) {
      window.clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
    if (isActive) {
      safePlay();
    }
  }, [isActive, safePlay]);

  const handleWaiting = useCallback(() => {
    if (waitingTimeoutRef.current) {
      window.clearTimeout(waitingTimeoutRef.current);
    }

    waitingTimeoutRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      waitingTimeoutRef.current = null;
    }, 140);
  }, []);

  const handlePlaying = useCallback(() => {
    if (waitingTimeoutRef.current) {
      window.clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
    setIsPlaying(true);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !user || !isActive) return;

    if (!tracked3sRef.current && vid.currentTime >= 3) {
      tracked3sRef.current = true;
      trackEvent.mutate({ videoId: video.id, eventType: "view_3s" });
    }

    const duration = vid.duration || 0;
    if (duration > 0 && !trackedCompleteRef.current && vid.currentTime / duration >= 0.9) {
      trackedCompleteRef.current = true;
      trackEvent.mutate({
        videoId: video.id,
        eventType: "view_complete",
        watchMs: Math.round(vid.currentTime * 1000),
      });

      setShowMoreLikeChip(true);
      window.setTimeout(() => setShowMoreLikeChip(false), 4500);

      const completedIdsRaw = window.sessionStorage.getItem("opium_session_completed_ids");
      const completedIds = new Set<string>(
        completedIdsRaw ? JSON.parse(completedIdsRaw) : [],
      );
      if (!completedIds.has(video.id)) {
        completedIds.add(video.id);
        const nextCount = completedIds.size;
        window.sessionStorage.setItem("opium_session_completed_ids", JSON.stringify([...completedIds]));
        window.sessionStorage.setItem("opium_session_view_complete_count", String(nextCount));
        setSessionStreakCount(nextCount);

        if ([3, 7, 12].includes(nextCount)) {
          toast.success(`Streak ${nextCount} • Your feed is getting sharper`);
        }
      }
    }
  }, [isActive, trackEvent, user, video.id]);

  return (
    <div className="feed-item relative h-full w-full overflow-hidden bg-background">
      {isVideo && hasLoadedMedia ? (
        <video
          key={`${video.id}-${retryToken}`}
          ref={videoRef}
          src={isHlsSource ? undefined : video.video_url}
          poster={posterUrl}
          className="feed-media absolute inset-0 h-full w-full object-cover"
          loop
          playsInline
          webkit-playsinline="true"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          muted={isMuted}
          preload={isActive ? "auto" : "metadata"}
          onCanPlay={handleCanPlay}
          onError={handleVideoError}
          onStalled={() => setIsPlaying(false)}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onTimeUpdate={handleTimeUpdate}
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
        onPointerMove={handleMediaPointerMove}
        onPointerUp={handleMediaPointerUp}
        onPointerCancel={handleMediaPointerCancel}
        onPointerLeave={handleMediaPointerCancel}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30 pointer-events-none" />

      <div className="absolute left-3 top-16 z-10">
        <div className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Flame className="h-3 w-3" />
          {socialProofLabel}
        </div>
      </div>

      {sessionStreakCount > 0 && (
        <div className="absolute left-3 top-24 z-10">
          <div className="inline-flex items-center gap-1 rounded-full bg-primary/85 px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            <Sparkles className="h-3 w-3" />
            Streak {sessionStreakCount}
          </div>
        </div>
      )}

      {/* Mute toggle */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          className="lift-on-tap absolute right-3 top-16 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </button>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          setShowSafetyMenu((prev) => !prev);
        }}
        className="lift-on-tap absolute right-3 top-28 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
      >
        <MoreHorizontal className="h-4 w-4 text-white" />
      </button>

      {showSafetyMenu && (
        <div className="absolute right-3 top-40 z-30 w-40 overflow-hidden rounded-xl border border-border bg-background/95 p-1.5 backdrop-blur">
          <button onClick={handleHide} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-secondary">
            <EyeOff className="h-3.5 w-3.5" />
            Hide video
          </button>
          <button onClick={handleMute} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-secondary">
            <BellOff className="h-3.5 w-3.5" />
            Mute creator
          </button>
          <button onClick={handleBlock} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-secondary">
            <UserX className="h-3.5 w-3.5" />
            Block creator
          </button>
          <button onClick={handleReport} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-destructive hover:bg-secondary">
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
        </div>
      )}

      {/* Muted indicator — like Instagram Reels */}
      {isVideo && isMuted && isPlaying && (
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

      {mediaError && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            retryPlayback();
          }}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm"
        >
          Tap to retry
        </button>
      )}

      {showFollowPrompt && (
        <div className="absolute left-3 top-32 z-20">
          <button
            onClick={handleQuickFollow}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Follow @{profile?.username || "creator"}
          </button>
        </div>
      )}

      {showMoreLikeChip && (
        <div className="absolute left-3 top-44 z-20">
          <button
            onClick={() => navigate(`/discover?q=${encodeURIComponent(discoveryTopic)}`)}
            className="rounded-full bg-secondary/90 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur-sm"
          >
            More like this
          </button>
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

        <button onClick={handleShare} className="lift-on-tap flex flex-col items-center gap-1">
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
    prev.isActive === next.isActive &&
    prev.isNearActive === next.isNearActive &&
    prev.isMuted === next.isMuted &&
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
